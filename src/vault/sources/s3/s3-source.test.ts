import { createTestClock } from "@softure-ai/core";
import { createFakeS3, type FakeS3 } from "@softure-ai/files/testing";
import { describe, expect, it } from "vitest";
import { describeSourceContract } from "../../testing/source-contract.ts";
import { parseS3Location, type S3Location } from "./s3-location.ts";
import { createS3Source } from "./s3-source.ts";

const KEYS = { accessKeyId: "AKIAFICTIONAL0000001", secretAccessKey: "fictional-secret-for-tests-only" };

function locate(prefix: string, endpoint = "http://127.0.0.1:9000/s3"): S3Location {
  const location = parseS3Location({ endpoint, region: "", bucket: "notes-bucket", prefix }, { allowPrivateEndpoints: true });
  if (!location.ok) throw new Error(location.error);
  return location.value;
}

function setUp(prefix = "vault", options: { readonly maxObjects?: number; readonly secret?: string } = {}) {
  const s3 = createFakeS3({ bucket: "notes-bucket", basePath: "/s3", ...KEYS });
  const open = () =>
    createS3Source({
      location: locate(prefix),
      credentials: { ...KEYS, secretAccessKey: options.secret ?? KEYS.secretAccessKey },
      fetch: s3.fetch,
      ...(options.maxObjects === undefined ? {} : { maxObjects: options.maxObjects }),
    });
  return { s3, open };
}

function withPrefix(s3: FakeS3, prefix: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) s3.put(prefix === "" ? path : `${prefix}/${path}`, text);
}

describeSourceContract("the S3 adapter", (files) => {
  const { s3, open } = setUp("vault");
  withPrefix(s3, "vault", files);
  return { open, write: (path, text) => s3.put(`vault/${path}`, text), remove: (path) => s3.remove(`vault/${path}`) };
});

describeSourceContract("the S3 adapter at the bucket's root", (files) => {
  const { s3, open } = setUp("");
  withPrefix(s3, "", files);
  return { open, write: (path, text) => s3.put(path, text), remove: (path) => s3.remove(path) };
});

describe("the S3 adapter", () => {
  it("lists only the prefix's files, without folder markers, as paths relative to the prefix", async () => {
    const { s3, open } = setUp("vault");
    s3.put("vault/", "");
    s3.put("vault/Notes/", "");
    s3.put("vault/Notes/Plan.md", "# Plan");
    s3.put("vault-old/Notes/Gone.md", "# Gone");
    s3.put("other/Note.md", "# Other");
    const listing = await open().listTree();
    expect(listing.ok && listing.value.files.map((file) => file.path)).toEqual(["Notes/Plan.md"]);
  });

  it("follows continuation tokens across pages and shares one listing between cursor and tree", async () => {
    const { s3, open } = setUp("vault");
    for (let index = 0; index < 2500; index += 1) s3.put(`vault/Notes/${String(index).padStart(4, "0")}.md`, `# ${String(index)}`);
    const source = open();
    const cursor = await source.getCursor();
    const listing = await source.listTree();
    expect(listing.ok && listing.value.files.length).toBe(2500);
    expect(cursor.ok && listing.ok && cursor.value === listing.value.cursor).toBe(true);
    expect(s3.calls.list).toBe(3);
  });

  it("refuses a vault larger than the object cap rather than work from part of it", async () => {
    const { s3, open } = setUp("vault", { maxObjects: 3 });
    for (const name of ["a", "b", "c", "d"]) s3.put(`vault/${name}.md`, name);
    const listing = await open().listTree();
    expect(!listing.ok && listing.error).toBe("source.too_large");
  });

  it("reads keys with spaces, unicode and reserved characters", async () => {
    const { s3, open } = setUp("My vault (2026)");
    s3.put("My vault (2026)/Café crème naïve/A+B & C's #1.md", "# Odd name");
    const source = open();
    const listing = await source.listTree();
    if (!listing.ok) throw new Error(listing.error);
    expect(listing.value.files.map((file) => file.path)).toEqual(["Café crème naïve/A+B & C's #1.md"]);
    const file = listing.value.files[0];
    if (file === undefined) throw new Error("no file");
    const bytes = await source.readFile(file);
    expect(bytes.ok && new TextDecoder().decode(bytes.value)).toBe("# Odd name");
  });

  it("answers a wrong secret as disconnected and never retries the listing it failed", async () => {
    const { s3, open } = setUp("vault", { secret: "not-the-secret" });
    s3.put("vault/Note.md", "# Note");
    const source = open();
    const first = await source.listTree();
    const second = await source.listTree();
    expect([!first.ok && first.error, !second.ok && second.error]).toEqual(["source.disconnected", "source.disconnected"]);
    expect(s3.calls.list).toBe(0);
  });

  it.each([
    [403, "source.disconnected"],
    [401, "source.disconnected"],
    [404, "source.not_found"],
    [429, "source.rate_limited"],
    [503, "source.rate_limited"],
    [500, "source.unavailable"],
    [400, "source.unexpected"],
    [301, "source.unexpected"],
  ])("maps a listing answered %i to %s", async (status, code) => {
    const { s3, open } = setUp();
    s3.fail("list", status);
    const listing = await open().listTree();
    expect(!listing.ok && listing.error).toBe(code);
  });

  it("maps a read answered 403 to disconnected and an oversized object to too large", async () => {
    const { s3 } = setUp();
    s3.put("vault/Big.md", "x".repeat(64));
    const source = createS3Source({ location: locate("vault"), credentials: KEYS, fetch: s3.fetch, maxFileBytes: 16 });
    const listing = await source.listTree();
    if (!listing.ok) throw new Error(listing.error);
    const big = listing.value.files[0];
    if (big === undefined) throw new Error("no file");
    const tooLarge = await source.readFile(big);
    s3.fail("get", 403);
    const refused = await source.readFile(big);
    expect([!tooLarge.ok && tooLarge.error, !refused.ok && refused.error]).toEqual(["source.too_large", "source.disconnected"]);
  });

  it("reads a bucket that is not there as not found", async () => {
    const s3 = createFakeS3({ bucket: "another-bucket", basePath: "/s3", ...KEYS });
    const listing = await createS3Source({ location: locate("vault"), credentials: KEYS, fetch: s3.fetch }).listTree();
    expect(!listing.ok && listing.error).toBe("source.not_found");
  });

  it("probes with one single-key listing call", async () => {
    const { s3, open } = setUp();
    for (const name of ["a", "b"]) s3.put(`vault/${name}.md`, name);
    const probe = await open().probe();
    expect(probe.ok).toBe(true);
    expect(s3.calls.list).toBe(1);
    s3.fail("list", 403);
    const refused = await open().probe();
    expect(!refused.ok && refused.error).toBe("source.disconnected");
  });

  it("signs with the clock it is given", async () => {
    const { s3 } = setUp();
    s3.put("vault/Note.md", "# Note");
    const requests: Request[] = [];
    const source = createS3Source({
      location: locate("vault"),
      credentials: KEYS,
      clock: createTestClock(new Date("2026-11-17T10:00:00Z")),
      fetch: (input, init) => {
        const request = new Request(input, init);
        requests.push(request.clone());
        return s3.handle(request);
      },
    });
    expect((await source.getCursor()).ok).toBe(true);
    expect(requests[0]?.headers.get("x-amz-date")).toBe("20261117T100000Z");
    expect(requests[0]?.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAFICTIONAL0000001\/20261117\/auto\/s3\/aws4_request, /);
  });
});

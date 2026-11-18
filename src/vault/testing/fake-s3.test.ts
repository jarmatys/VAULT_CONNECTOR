// The writable fake bucket against the app's own S3 driver: what the note store of the end-to-end runs relies on.
import { createS3Storage } from "@softure-ai/files/server";
import { describe, expect, it } from "vitest";
import { createFakeS3 } from "./fake-s3.ts";

const KEYS = { accessKeyId: "AKIAFAKESTORE0001", secretAccessKey: "fake-store-secret-not-for-production" };
const ENV = { STORE_KEY_ID: KEYS.accessKeyId, STORE_SECRET: KEYS.secretAccessKey };

function setUp(isWritable: boolean) {
  const s3 = createFakeS3({ bucket: "notes-store", basePath: "/store", isWritable, ...KEYS });
  const storage = createS3Storage({
    endpoint: "http://127.0.0.1:3199/store",
    bucket: "notes-store",
    region: "auto",
    accessKeyIdEnv: "STORE_KEY_ID",
    secretAccessKeyEnv: "STORE_SECRET",
    env: ENV,
    fetch: s3.fetch,
  });
  return { s3, storage };
}

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  return stream === null ? "<missing>" : new Response(stream).text();
}

function bodyOf(text: string): ReadableStream<Uint8Array> {
  return new Blob([text]).stream();
}

describe("createFakeS3, writable", () => {
  it("stores, reads (whole and by range), sizes and deletes an object signed with its key pair", async () => {
    const { s3, storage } = setUp(true);

    await storage.put(bodyOf("# Garden\nRaised beds.\n"), "copies/a.md");

    expect(await readAll(await storage.get("copies/a.md"))).toBe("# Garden\nRaised beds.\n");
    expect(await readAll(await storage.get("copies/a.md", { start: 2, end: 7 }))).toBe("Garden");
    expect(await storage.head("copies/a.md")).toEqual({ size: 22 });
    await storage.delete("copies/a.md");
    expect(await storage.head("copies/a.md")).toBeNull();
    expect(await storage.get("copies/a.md")).toBeNull();
    expect(s3.calls).toMatchObject({ put: 1, get: 3, head: 2, delete: 1 });
  });

  it("passes the driver's health probe", async () => {
    const { storage } = setUp(true);

    expect(await storage.check?.()).toEqual({ isWritable: true, freeBytes: null });
  });

  it("refuses writes when read-only, as the account's vault bucket is", async () => {
    const { storage } = setUp(false);

    await expect(storage.put(bodyOf("x"), "copies/a.md")).rejects.toThrow();
  });
});

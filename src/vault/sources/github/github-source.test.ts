// The git adapter against an in-memory GitHub repository: the tree at the head, one file's bytes, the changes since a
// commit (with renames, a rewritten history and the 300-file cap) and every failure as a source code.
import { describe, expect, it } from "vitest";
import { ok } from "@softure-ai/core";
import { COMPARE_FILE_CAP, createGithubSource } from "./github-source.ts";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const TOKEN = "ghs_test-token";

interface FakeAnswer {
  readonly status?: number;
  readonly body?: unknown;
  readonly raw?: string;
  readonly headers?: Record<string, string>;
}

/** A fetch that answers GitHub's paths from a table and records what it was asked; anything else is 404. */
function createRepositoryFetch(routes: Record<string, FakeAnswer>) {
  const seen: { url: string; headers: Headers }[] = [];
  const fetch = (input: string | URL, init: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = new Headers(init.headers);
    seen.push({ url: `${url.pathname}${url.search}`, headers });
    if (headers.get("authorization") !== `Bearer ${TOKEN}`) return Promise.resolve(new Response("{}", { status: 401 }));
    const answer = routes[`${url.pathname}${url.search}`];
    if (answer === undefined) return Promise.resolve(Response.json({ message: "Not Found" }, { status: 404 }));
    const body = answer.raw ?? JSON.stringify(answer.body);
    return Promise.resolve(new Response(body, { status: answer.status ?? 200, headers: { "content-type": "application/json", ...answer.headers } }));
  };
  return { fetch, seen };
}

const COMMIT = { "/repos/octo%20cat/my-notes/commits/main": { body: { sha: HEAD, commit: { tree: { sha: "tree1" } } } } };

function createSource(routes: Record<string, FakeAnswer>) {
  const fake = createRepositoryFetch({ ...COMMIT, ...routes });
  const source = createGithubSource({
    repository: { fullName: "octo cat/my-notes", branch: "main" },
    getToken: () => Promise.resolve(ok(TOKEN)),
    fetch: fake.fetch,
    apiUrl: "https://api.github.test/",
  });
  return { source, seen: fake.seen };
}

describe("the git source", () => {
  it("lists every file of the head's tree, leaving out folders, symlinks and submodules", async () => {
    const { source, seen } = createSource({
      "/repos/octo%20cat/my-notes/git/trees/tree1?recursive=1": {
        body: {
          truncated: false,
          tree: [
            { path: "Daily", mode: "040000", type: "tree", sha: "t2" },
            { path: "Daily/2026-11-17.md", mode: "100644", type: "blob", sha: "blob1", size: 120 },
            { path: "Index.md", mode: "100644", type: "blob", sha: "blob2", size: 7 },
            { path: "link.md", mode: "120000", type: "blob", sha: "blob3", size: 9 },
            { path: "plugin", mode: "160000", type: "commit", sha: "c1" },
          ],
        },
      },
    });
    expect(await source.listTree()).toEqual({
      ok: true,
      value: {
        cursor: HEAD,
        files: [
          { path: "Daily/2026-11-17.md", version: "blob1", size: 120 },
          { path: "Index.md", version: "blob2", size: 7 },
        ],
      },
    });
    expect(seen.map((call) => call.url)).toEqual(["/repos/octo%20cat/my-notes/commits/main", "/repos/octo%20cat/my-notes/git/trees/tree1?recursive=1"]);
    expect(seen[0]?.headers.get("x-github-api-version")).toBe("2022-11-28");
  });

  it("refuses a tree GitHub cut short instead of listing part of the vault", async () => {
    const { source } = createSource({ "/repos/octo%20cat/my-notes/git/trees/tree1?recursive=1": { body: { truncated: true, tree: [] } } });
    expect(await source.listTree()).toEqual({ ok: false, error: "source.too_large", retryAfterSeconds: null });
  });

  it("reads one file's raw bytes by its version, and refuses one over the cap", async () => {
    const { source, seen } = createSource({ "/repos/octo%20cat/my-notes/git/blobs/blob1": { raw: "# Hello" } });
    const read = await source.readFile({ path: "Index.md", version: "blob1" });
    expect(read.ok && new TextDecoder().decode(read.value)).toBe("# Hello");
    expect(seen.at(-1)?.headers.get("accept")).toBe("application/vnd.github.raw");

    const small = createGithubSource({
      repository: { fullName: "octo cat/my-notes", branch: "main" },
      getToken: () => Promise.resolve(ok(TOKEN)),
      fetch: createRepositoryFetch({ "/repos/octo%20cat/my-notes/git/blobs/blob1": { raw: "0123456789" } }).fetch,
      maxFileBytes: 4,
    });
    expect(await small.readFile({ path: "Index.md", version: "blob1" })).toEqual({ ok: false, error: "source.too_large", retryAfterSeconds: null });
  });

  it("lists the changes since a commit, renames included, and none when nothing moved", async () => {
    const { source } = createSource({
      [`/repos/octo%20cat/my-notes/compare/${BASE}...${HEAD}`]: {
        body: {
          status: "ahead",
          files: [
            { filename: "New.md", status: "added", sha: "n1" },
            { filename: "Edited.md", status: "modified", sha: "e1" },
            { filename: "Mode.md", status: "changed", sha: "m1" },
            { filename: "Gone.md", status: "removed", sha: "g1" },
            { filename: "Moved/Note.md", status: "renamed", sha: "r1", previous_filename: "Note.md" },
            { filename: "Copy.md", status: "copied", sha: "c1" },
          ],
        },
      },
    });
    expect(await source.listChangesSince(BASE)).toEqual({
      ok: true,
      value: {
        kind: "changes",
        cursor: HEAD,
        changes: [
          { kind: "added", path: "New.md", version: "n1" },
          { kind: "modified", path: "Edited.md", version: "e1" },
          { kind: "modified", path: "Mode.md", version: "m1" },
          { kind: "removed", path: "Gone.md" },
          { kind: "renamed", path: "Moved/Note.md", previousPath: "Note.md", version: "r1" },
          { kind: "added", path: "Copy.md", version: "c1" },
        ],
      },
    });
    expect(await source.listChangesSince(HEAD)).toEqual({ ok: true, value: { kind: "changes", cursor: HEAD, changes: [] } });
  });

  it("asks for a full resync after a rewritten history, an unknown cursor or a comparison at GitHub's file cap", async () => {
    const files = Array.from({ length: COMPARE_FILE_CAP }, (_, index) => ({ filename: `n${String(index)}.md`, status: "added", sha: `s${String(index)}` }));
    const unknown = "c".repeat(40);
    const { source } = createSource({
      [`/repos/octo%20cat/my-notes/compare/${BASE}...${HEAD}`]: { body: { status: "diverged", files: [] } },
      [`/repos/octo%20cat/my-notes/compare/${"d".repeat(40)}...${HEAD}`]: { body: { status: "ahead", files } },
    });
    const resync = { ok: true, value: { kind: "full_resync", cursor: HEAD } };
    expect(await source.listChangesSince(BASE)).toEqual(resync);
    expect(await source.listChangesSince(unknown)).toEqual(resync);
    expect(await source.listChangesSince("d".repeat(40))).toEqual(resync);
  });

  it("turns GitHub's answers into source codes", async () => {
    const cases: [FakeAnswer, unknown][] = [
      [{ status: 404, body: { message: "Not Found" } }, { ok: false, error: "source.not_found", retryAfterSeconds: null }],
      [{ status: 401, body: {} }, { ok: false, error: "source.disconnected", retryAfterSeconds: null }],
      [{ status: 403, body: {} }, { ok: false, error: "source.disconnected", retryAfterSeconds: null }],
      [{ status: 403, body: {}, headers: { "x-ratelimit-remaining": "0" } }, { ok: false, error: "source.rate_limited", retryAfterSeconds: null }],
      [{ status: 429, body: {}, headers: { "retry-after": "60" } }, { ok: false, error: "source.rate_limited", retryAfterSeconds: 60 }],
      [{ status: 502, body: {} }, { ok: false, error: "source.unavailable", retryAfterSeconds: null }],
      [{ body: { unexpected: true } }, { ok: false, error: "source.unexpected", retryAfterSeconds: null }],
    ];
    for (const [answer, expected] of cases) {
      const { source } = createSource({ "/repos/octo%20cat/my-notes/commits/main": answer });
      expect(await source.getCursor()).toEqual(expected);
    }
  });

  it("passes on a token failure without calling GitHub", async () => {
    let calls = 0;
    const source = createGithubSource({
      repository: { fullName: "octo/notes", branch: "main" },
      getToken: () => Promise.resolve({ ok: false, error: "source.disconnected", retryAfterSeconds: null }),
      fetch: () => {
        calls += 1;
        return Promise.resolve(new Response("{}"));
      },
    });
    expect(await source.listTree()).toEqual({ ok: false, error: "source.disconnected", retryAfterSeconds: null });
    expect(calls).toBe(0);
  });
});

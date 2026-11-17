import { describe, expect, it } from "vitest";
import { createFakeDropbox, type FakeDropbox } from "../../testing/fake-dropbox.ts";
import { describeSourceContract } from "../../testing/source-contract.ts";
import { DROPBOX_SCOPES, exchangeDropboxCode, refreshDropboxToken } from "./dropbox-api.ts";
import { parseDropboxFolder } from "./dropbox-folder.ts";
import { createDropboxSource } from "./dropbox-source.ts";

const APP = { appKey: "fictional-app-key", appSecret: "fictional-app-secret-for-tests" };
const REDIRECT_URI = "http://localhost:3100/panel/source/dropbox/callback";
const VERIFIER = "v".repeat(43);

async function challengeOf(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return Buffer.from(digest).toString("base64url");
}

/** A refresh token from the fake, through the same code flow the link uses. */
async function grant(dropbox: FakeDropbox, scopes: readonly string[] = DROPBOX_SCOPES): Promise<string> {
  const authorize = new URL("https://www.dropbox.com/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: APP.appKey,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state: "s",
    scope: scopes.join(" "),
    code_challenge: await challengeOf(VERIFIER),
    code_challenge_method: "S256",
  }).toString();
  const code = dropbox.approve(authorize).searchParams.get("code") ?? "";
  const exchanged = await exchangeDropboxCode(APP, { code, redirectUri: REDIRECT_URI, codeVerifier: VERIFIER }, { fetch: dropbox.fetch });
  if (!exchanged.ok) throw new Error(exchanged.error);
  return exchanged.value.refreshToken;
}

async function setUp(folder: string, options: { readonly pageSize?: number; readonly lowerCaseParents?: boolean; readonly maxFiles?: number } = {}) {
  const dropbox = createFakeDropbox({ ...APP, ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }), ...(options.lowerCaseParents === undefined ? {} : { lowerCaseParents: options.lowerCaseParents }) });
  const refreshToken = await grant(dropbox);
  const open = () =>
    createDropboxSource({
      folder,
      getAccessToken: () => refreshDropboxToken(APP, refreshToken, { fetch: dropbox.fetch }),
      fetch: dropbox.fetch,
      ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
    });
  return { dropbox, open };
}

describe("the Dropbox folder", () => {
  it("is stored with one leading slash, or empty for the root", () => {
    expect(parseDropboxFolder(" Obsidian/My vault/ ")).toEqual({ ok: true, value: "/Obsidian/My vault" });
    expect(parseDropboxFolder("/Apps/Notes")).toEqual({ ok: true, value: "/Apps/Notes" });
    expect(parseDropboxFolder("  /  ")).toEqual({ ok: true, value: "" });
  });

  it("refuses empty parts, dot parts, backslashes and control characters", () => {
    for (const input of ["a//b", "a/../b", "./a", "a\\b", "a\u0000b", "a/ /b", "x".repeat(513)]) {
      expect(parseDropboxFolder(input)).toEqual({ ok: false, error: "vault.dropbox_folder_invalid" });
    }
  });
});

describe("the Dropbox adapter", () => {
  // The contract builds its harnesses synchronously, so the grant is made on the first `open`.
  describeSourceContract("the Dropbox adapter", (files) => {
    const dropbox = createFakeDropbox(APP);
    for (const [path, text] of Object.entries(files)) dropbox.put(`/Obsidian/Vault/${path}`, text);
    let refreshToken: Promise<string> | null = null;
    return {
      open: () =>
        createDropboxSource({
          folder: "/Obsidian/Vault",
          getAccessToken: async () => {
            refreshToken ??= grant(dropbox);
            return refreshDropboxToken(APP, await refreshToken, { fetch: dropbox.fetch });
          },
          fetch: dropbox.fetch,
        }),
      write: (path, text) => dropbox.put(`/Obsidian/Vault/${path}`, text),
      remove: (path) => dropbox.remove(`/Obsidian/Vault/${path}`),
    };
  });

  it("lists only the folder's files as paths relative to it", async () => {
    const { dropbox, open } = await setUp("/Obsidian/Vault");
    dropbox.put("/Obsidian/Vault/Notes/Plan.md", "# Plan");
    dropbox.put("/Obsidian/Vault-old/Gone.md", "# Gone");
    dropbox.put("/Other/Note.md", "# Other");
    const listing = await open().listTree();
    expect(listing.ok && listing.value.files.map((file) => file.path)).toEqual(["Notes/Plan.md"]);
  });

  it("lists the whole grant when the folder is the root", async () => {
    const { dropbox, open } = await setUp("");
    dropbox.put("/Welcome.md", "# Welcome");
    dropbox.put("/Projects/Garden.md", "# Garden");
    const listing = await open().listTree();
    expect(listing.ok && listing.value.files.map((file) => file.path)).toEqual(["Projects/Garden.md", "Welcome.md"]);
  });

  it("matches the folder whatever case the account typed it in", async () => {
    const { dropbox, open } = await setUp("/obsidian/VAULT");
    dropbox.put("/Obsidian/Vault/Note.md", "# Note");
    const listing = await open().listTree();
    expect(listing.ok && listing.value.files.map((file) => file.path)).toEqual(["Note.md"]);
  });

  it("names parent folders from their own entries when Dropbox lower-cases them in path_display", async () => {
    const { dropbox, open } = await setUp("/Vault", { lowerCaseParents: true });
    dropbox.put("/Vault/Projects/Deep Work/Plan.md", "# Plan");
    const listing = await open().listTree();
    expect(listing.ok && listing.value.files.map((file) => file.path)).toEqual(["Projects/Deep Work/Plan.md"]);
  });

  it("follows listing pages, asks for one token, and shares one listing between cursor and tree", async () => {
    const { dropbox, open } = await setUp("/Vault", { pageSize: 100 });
    for (let index = 0; index < 250; index += 1) dropbox.put(`/Vault/Notes/${String(index).padStart(3, "0")}.md`, `# ${String(index)}`);
    const tokensBefore = dropbox.calls.token;
    const source = open();
    const cursor = await source.getCursor();
    const listing = await source.listTree();
    expect(listing.ok && listing.value.files.length).toBe(250);
    expect(cursor.ok && listing.ok && cursor.value === listing.value.cursor).toBe(true);
    // 250 files and one folder entry: three pages of 100.
    expect(dropbox.calls.list).toBe(3);
    expect(dropbox.calls.token - tokensBefore).toBe(1);
  });

  it("answers too large above the file cap", async () => {
    const { dropbox, open } = await setUp("/Vault", { maxFiles: 3 });
    for (let index = 0; index < 4; index += 1) dropbox.put(`/Vault/${String(index)}.md`, "#");
    const listing = await open().listTree();
    expect(listing.ok ? "ok" : listing.error).toBe("source.too_large");
  });

  it("answers not found for a folder that does not exist", async () => {
    const { open } = await setUp("/Missing");
    const probe = await open().probe();
    expect(probe.ok ? "ok" : probe.error).toBe("source.not_found");
  });

  it("probes an existing folder with one listing call of one entry", async () => {
    const { dropbox, open } = await setUp("/Vault");
    dropbox.put("/Vault/A.md", "#");
    dropbox.put("/Vault/B.md", "#");
    const probe = await open().probe();
    expect(probe.ok).toBe(true);
    expect(dropbox.calls.list).toBe(1);
  });

  it("answers disconnected when the grant was revoked", async () => {
    const { dropbox, open } = await setUp("/Vault");
    dropbox.put("/Vault/A.md", "#");
    dropbox.revokeAll();
    const listing = await open().listTree();
    expect(listing.ok ? "ok" : listing.error).toBe("source.disconnected");
  });

  it("maps Dropbox's statuses to source codes and keeps the retry hint", async () => {
    const { dropbox, open } = await setUp("/Vault");
    dropbox.put("/Vault/A.md", "#");
    const outcomes: string[] = [];
    for (const status of [429, 500, 503, 403, 400]) {
      dropbox.fail("list", status);
      const listing = await open().listTree();
      outcomes.push(listing.ok ? "ok" : listing.error);
    }
    dropbox.fail("list", null);
    expect(outcomes).toEqual(["source.rate_limited", "source.unavailable", "source.unavailable", "source.disconnected", "source.unexpected"]);
  });

  it("answers unavailable when the token endpoint is down, and tries the token again on the next call", async () => {
    const { dropbox, open } = await setUp("/Vault");
    dropbox.put("/Vault/A.md", "#");
    const source = open();
    dropbox.fail("token", 503);
    const first = await source.listTree();
    dropbox.fail("token", null);
    const second = await source.listTree();
    expect([first.ok ? "ok" : first.error, second.ok ? "ok" : second.error]).toEqual(["source.unavailable", "ok"]);
  });

  it("reads a file at its listed revision and refuses one over the size cap", async () => {
    const dropbox = createFakeDropbox(APP);
    const refreshToken = await grant(dropbox);
    dropbox.put("/Vault/Big.md", "x".repeat(64));
    const source = createDropboxSource({ folder: "/Vault", getAccessToken: () => refreshDropboxToken(APP, refreshToken, { fetch: dropbox.fetch }), fetch: dropbox.fetch, maxFileBytes: 32 });
    const listing = await source.listTree();
    const big = listing.ok ? listing.value.files[0] : undefined;
    if (big === undefined) throw new Error("not listed");
    const read = await source.readFile(big);
    expect(read.ok ? "ok" : read.error).toBe("source.too_large");
  });

});

// Connecting a Dropbox folder on a test database against the in-memory Dropbox: the one-time state bound to the
// account, a declined or write-capable grant refused, a missing folder refused, the refresh token sealed to the
// account, picks kept or dropped when the source changes, the database's own rules for a Dropbox row, the grant revoked
// on disconnect, and the sync copying picked notes, following a change and stopping on a revoked grant.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { generateConnectionsKey } from "@softure-ai/connections/server";
import { createMemoryStorage } from "@softure-ai/files/testing";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../../softure.config.ts";
import { listSharedFolders, saveSharedFolders } from "../../folders/shared-folders.ts";
import { readDropboxSourceSettings } from "../../settings.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "../../sync/sync-jobs.ts";
import { listNotes } from "../../sync/sync-store.ts";
import { createFakeDropbox, type FakeDropbox, type FakeDropboxApproval } from "../../testing/fake-dropbox.ts";
import { createVaultTestDatabase, type TestDatabase } from "../../testing/test-database.ts";
import { createSourceOpener } from "../open-source.ts";
import { VAULT_SOURCE_KEYS_ENV } from "../s3/s3-credentials.ts";
import { findSource, getSourceLabel, saveGithubSource } from "../store.ts";
import { openDropboxRefreshToken } from "./dropbox-credentials.ts";
import { completeDropboxLink, readDropboxLinkError, revokeDropboxSource, startDropboxLink, type ConfiguredDropboxSettings, type DropboxLinkContext } from "./link.ts";

const APP = { appKey: "fictionalappkey", appSecret: "fictional-app-secret-for-link-tests" };
const FOLDERS = new Set(["Work", "Personal"]);
const SECRET = "test-key-secret-0123456789abcdef0123";

let database: TestDatabase;
let clock: TestClock;
let dropbox: FakeDropbox;
let settings: ConfiguredDropboxSettings;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(new Date("2026-11-17T12:00:30Z"));
  dropbox = createFakeDropbox(APP);
  dropbox.put("/Obsidian/Vault/Work/Plan.md", "# Plan");
  dropbox.put("/Obsidian/Vault/Personal/Diary.md", "# Diary");
  dropbox.put("/Other/Note.md", "# Other");
  const read = readDropboxSourceSettings({ DROPBOX_APP_KEY: APP.appKey, DROPBOX_APP_SECRET: APP.appSecret, [VAULT_SOURCE_KEYS_ENV]: generateConnectionsKey("test") });
  if (read.kind !== "configured") throw new Error("Dropbox settings not configured");
  settings = read;
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

function context(): DropboxLinkContext {
  return { db: database.db, clock, settings, appOrigin: "https://vault.example.com", fetch: dropbox.fetch };
}

/** The whole link as the browser walks it: start, Dropbox's consent page, the callback. */
async function link(userId: string, folder = "Obsidian/Vault", approval: FakeDropboxApproval = {}, callbackUserId = userId) {
  const started = await startDropboxLink(context(), userId, folder);
  if (!started.ok) return started;
  const callback = dropbox.approve(started.value, approval);
  return completeDropboxLink(context(), callbackUserId, { state: callback.searchParams.get("state"), code: callback.searchParams.get("code"), error: callback.searchParams.get("error") });
}

async function pick(userId: string, paths: string[]) {
  expect((await saveSharedFolders(database.db, { userId, paths, knownFolders: FOLDERS, now: clock.now() })).ok).toBe(true);
}

describe("connecting a Dropbox folder", () => {
  it("asks Dropbox for the two read-only scopes, offline access and PKCE, with the app's own redirect", async () => {
    const started = await startDropboxLink(context(), aliceId, "/Obsidian/Vault/");
    if (!started.ok) throw new Error(started.error);
    const query = started.value.searchParams;
    expect(started.value.origin + started.value.pathname).toBe("https://www.dropbox.com/oauth2/authorize");
    expect({
      scope: query.get("scope"),
      access: query.get("token_access_type"),
      method: query.get("code_challenge_method"),
      redirect: query.get("redirect_uri"),
    }).toEqual({ scope: "files.metadata.read files.content.read", access: "offline", method: "S256", redirect: "https://vault.example.com/panel/source/dropbox/callback" });
    const states = await database.db.execute<{ state_hash: string; kind: string; dropbox_folder: string }>(sql`SELECT state_hash, kind, dropbox_folder FROM vault.source_link_states`);
    expect(states.rows).toHaveLength(1);
    expect(states.rows[0]).toMatchObject({ kind: "dropbox", dropbox_folder: "/Obsidian/Vault" });
    expect(states.rows[0]?.state_hash).not.toBe(query.get("state"));
  });

  it("stores the folder and only a sealed refresh token that opens for this account alone", async () => {
    const linked = await link(aliceId);
    if (!linked.ok) throw new Error(linked.error);
    const stored = await findSource(database.db, aliceId);
    expect(stored).toMatchObject({ kind: "dropbox", status: "connected", folder: "/Obsidian/Vault", accountId: "dbid:AAFictionalAccount0001" });
    if (stored?.kind !== "dropbox") throw new Error("no Dropbox source");
    expect(getSourceLabel(stored)).toBe("/Obsidian/Vault (Dropbox)");
    const refreshToken = openDropboxRefreshToken(settings.keyring, aliceId, stored.sealedCredentials);
    expect(refreshToken).toMatch(/^refresh-/);
    expect(openDropboxRefreshToken(settings.keyring, bobId, stored.sealedCredentials)).toBeNull();
    const raw = await database.db.execute<{ row: string }>(sql`SELECT row_to_json(s)::text AS row FROM vault.sources s WHERE user_id = ${aliceId}`);
    expect(raw.rows[0]?.row).not.toContain(refreshToken ?? "");
    expect(await database.db.execute(sql`SELECT 1 FROM vault.source_link_states`)).toMatchObject({ rows: [] });
  });

  it("refuses a state that another account started, and a state used twice", async () => {
    const stolen = await link(aliceId, "Obsidian/Vault", {}, bobId);
    expect(!stolen.ok && stolen.error).toBe("vault.dropbox_link_expired");
    const started = await startDropboxLink(context(), aliceId, "Obsidian/Vault");
    if (!started.ok) throw new Error(started.error);
    const callback = dropbox.approve(started.value);
    const params = { state: callback.searchParams.get("state"), code: callback.searchParams.get("code"), error: null };
    expect((await completeDropboxLink(context(), aliceId, params)).ok).toBe(true);
    const again = await completeDropboxLink(context(), aliceId, params);
    expect(!again.ok && again.error).toBe("vault.dropbox_link_expired");
  });

  it("refuses a state older than ten minutes", async () => {
    const started = await startDropboxLink(context(), aliceId, "Obsidian/Vault");
    if (!started.ok) throw new Error(started.error);
    const callback = dropbox.approve(started.value);
    clock.advance(10 * 60 * 1000 + 1);
    const late = await completeDropboxLink(context(), aliceId, { state: callback.searchParams.get("state"), code: callback.searchParams.get("code"), error: null });
    expect(!late.ok && late.error).toBe("vault.dropbox_link_expired");
  });

  it("refuses a declined consent, a grant that can write (and revokes it), and a missing folder; stores nothing", async () => {
    const declined = await link(aliceId, "Obsidian/Vault", { deny: true });
    const writes = await link(aliceId, "Obsidian/Vault", { grantScopes: ["files.metadata.read", "files.content.read", "files.content.write"] });
    const missing = await link(aliceId, "Obsidian/Nowhere");
    const notFolder = await link(aliceId, "Other/Note.md");
    const invalid = await link(aliceId, "a/../b");
    expect([declined, writes, missing, notFolder, invalid].map((result) => (result.ok ? "ok" : result.error))).toEqual([
      "vault.dropbox_denied",
      "vault.dropbox_permissions",
      "vault.dropbox_folder_not_found",
      "vault.dropbox_folder_not_found",
      "vault.dropbox_folder_invalid",
    ]);
    expect(await findSource(database.db, aliceId)).toBeNull();
    // The write-capable grant (the only one issued: a declined consent issues none) was revoked at once.
    expect(dropbox.listGrants()).toEqual([{ scopes: ["files.metadata.read", "files.content.read", "files.content.write"], isRevoked: true }, ...dropbox.listGrants().slice(1)]);
    expect(dropbox.listGrants()[0]?.isRevoked).toBe(true);
  });

  it("answers unavailable when Dropbox's token endpoint is down", async () => {
    dropbox.fail("token", 503);
    const down = await link(aliceId);
    expect(!down.ok && down.error).toBe("vault.dropbox_unavailable");
  });

  it("keeps picks for a new grant to the same folder and drops them for another folder or kind", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: clock.now() });
    await pick(aliceId, ["Work"]);
    await link(aliceId);
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    await pick(aliceId, ["Work"]);
    await link(aliceId, "obsidian/vault");
    expect((await listSharedFolders(database.db, aliceId)).map((folder) => folder.path)).toEqual(["Work"]);
    await link(aliceId, "Obsidian");
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    await pick(aliceId, ["Work"]);
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: clock.now() });
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    expect(await findSource(database.db, aliceId)).toMatchObject({ kind: "github", repositoryFullName: "alice/notes" });
  });

  it("is held by the database too: a Dropbox row needs every Dropbox field and no other kind's", async () => {
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, dropbox_account_id, dropbox_folder, connected_at, checked_at)
        VALUES (${aliceId}, 'dropbox', 'connected', 'dbid:AA', '/Vault', now(), now())`),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, dropbox_account_id, dropbox_folder, dropbox_credentials,
          s3_bucket, connected_at, checked_at)
        VALUES (${aliceId}, 'dropbox', 'connected', 'dbid:AA', '/Vault', 'v1.k.aa.bb', 'notes', now(), now())`),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, dropbox_account_id, dropbox_folder, dropbox_credentials,
          connected_at, checked_at)
        VALUES (${aliceId}, 'dropbox', 'connected', 'dbid:AA', '/Vault/', 'v1.k.aa.bb', now(), now())`),
    ).rejects.toThrow();
  });

  it("revokes the grant on disconnect", async () => {
    const linked = await link(aliceId);
    if (!linked.ok) throw new Error(linked.error);
    const refreshToken = openDropboxRefreshToken(settings.keyring, aliceId, linked.value.sealedCredentials) ?? "";
    expect(dropbox.isTokenLive(refreshToken)).toBe(true);
    expect(await revokeDropboxSource({ settings, fetch: dropbox.fetch }, linked.value)).toBe(true);
    expect(dropbox.isTokenLive(refreshToken)).toBe(false);
  });

  it("reads only its own codes from a URL", () => {
    expect([readDropboxLinkError("vault.dropbox_denied"), readDropboxLinkError("<script>"), readDropboxLinkError(["vault.dropbox_denied"])]).toEqual(["vault.dropbox_denied", null, null]);
  });
});

describe("syncing a Dropbox folder", () => {
  function handlers() {
    return createVaultSyncJobHandlers({
      storage: { storage: createMemoryStorage(), keySecret: SECRET },
      openSource: createSourceOpener({ github: { kind: "unconfigured" }, s3: { kind: "unconfigured" }, dropbox: settings, headlessSync: { kind: "unconfigured" }, dropboxFetch: dropbox.fetch }),
    });
  }

  async function sync(trigger: "webhook" | "schedule", handlerSet = handlers()) {
    await enqueueVaultSync({ db: database.db, clock, config }, { userId: aliceId, trigger });
    return runDueJobs({ db: database.db, clock, config }, { handlers: handlerSet, queues: [VAULT_SYNC_QUEUE], random: () => 0 });
  }

  it("copies the picked notes, notices a change at the next check and stops on a revoked grant", async () => {
    expect((await link(aliceId)).ok).toBe(true);
    await pick(aliceId, ["Work"]);
    const handlerSet = handlers();
    await sync("webhook", handlerSet);
    expect((await listNotes(database.db, aliceId)).map((note) => note.path)).toEqual(["Work/Plan.md"]);

    const listsBefore = dropbox.calls.list;
    const downloadsBefore = dropbox.calls.download;
    await sync("schedule", handlerSet);
    // Nothing changed: one listing call for the cursor, no read.
    expect([dropbox.calls.list - listsBefore, dropbox.calls.download - downloadsBefore]).toEqual([1, 0]);

    dropbox.put("/Obsidian/Vault/Work/Next.md", "# Next");
    dropbox.remove("/Obsidian/Vault/Work/Plan.md");
    await sync("schedule", handlerSet);
    expect((await listNotes(database.db, aliceId)).map((note) => note.path)).toEqual(["Work/Next.md"]);

    dropbox.revokeAll();
    dropbox.put("/Obsidian/Vault/Work/Later.md", "# Later");
    await sync("schedule", handlerSet);
    expect(await findSource(database.db, aliceId)).toMatchObject({ kind: "dropbox", status: "disconnected" });
  });
});

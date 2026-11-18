// Connecting a remote sync vault on a test database against the in-memory sync service: sign-in with and without a 2FA
// code, the vault list without any password, a standard vault connected with the key derived from its managed password,
// an end-to-end vault only with the key from the browser (a wrong one refused), a host off the allow-list refused, the
// session and key sealed to the account, the held session's cookie value, the database's own rules for a sync row, the
// export without secrets, the session ended on disconnect, and the sync copying picked notes and stopping when the
// session is gone.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { generateConnectionsKey } from "@softure-ai/connections/server";
import { createMemoryStorage } from "@softure-ai/files/testing";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../../softure.config.ts";
import { exportVaultUserData } from "../../erase/vault-privacy.ts";
import { listSharedFolders, saveSharedFolders } from "../../folders/shared-folders.ts";
import { readHeadlessSyncSourceSettings } from "../../settings.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "../../sync/sync-jobs.ts";
import { listNotes } from "../../sync/sync-store.ts";
import { createFakeHeadlessSync, createFakeSocketFactory, createFakeSyncFetch, type FakeHeadlessSync, type FakeSyncVault } from "../../testing/fake-headless-sync.ts";
import { createVaultTestDatabase, type TestDatabase } from "../../testing/test-database.ts";
import { createSourceOpener } from "../open-source.ts";
import { VAULT_SOURCE_KEYS_ENV } from "../s3/s3-credentials.ts";
import { findSource, getSourceLabel, saveGithubSource } from "../store.ts";
import { openHeadlessSyncCredentials } from "./headless-sync-credentials.ts";
import {
  connectHeadlessSyncVault,
  listVaultsForLink,
  openPendingToken,
  readHeadlessSyncLinkError,
  sealPendingToken,
  signInForLink,
  signOutHeadlessSyncSource,
  type ConfiguredHeadlessSyncSettings,
  type HeadlessSyncLinkContext,
} from "./link.ts";
import { deriveVaultKey, toHex } from "./sync-crypto.ts";

const ACCOUNT = { email: "person@example.test", password: "fictional-account-pass" };
const STANDARD: FakeSyncVault = { id: "vault-std", name: "Garden notes", encryption: "standard", password: "managed-fictional", salt: "salt-std", encryptionVersion: 3 };
const E2EE: FakeSyncVault = { id: "vault-e2e", name: "Private", encryption: "e2ee", password: "fictional e2e pass", salt: "salt-e2e", encryptionVersion: 3 };
const FOLDERS = new Set(["Work", "Personal"]);
const SECRET = "test-key-secret-0123456789abcdef0123";

let database: TestDatabase;
let clock: TestClock;
let fake: FakeHeadlessSync;
let settings: ConfiguredHeadlessSyncSettings;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(new Date("2026-11-17T12:00:30Z"));
  fake = createFakeHeadlessSync({ ...ACCOUNT, vaults: [STANDARD, E2EE], socketHost: "sync-7.obsidian.md" });
  await fake.write(STANDARD.id, "Work/Plan.md", "# Plan");
  await fake.write(STANDARD.id, "Personal/Diary.md", "# Diary");
  await fake.write(E2EE.id, "Work/Secret.md", "# Secret");
  const read = readHeadlessSyncSourceSettings({ [VAULT_SOURCE_KEYS_ENV]: generateConnectionsKey("test") });
  if (read.kind !== "configured") throw new Error("Sync settings not configured");
  settings = read;
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

function context(service: FakeHeadlessSync = fake): HeadlessSyncLinkContext {
  return { db: database.db, clock, settings, fetch: createFakeSyncFetch(service), socketFactory: createFakeSocketFactory(service), timeoutMs: 2000 };
}

async function signIn(service: FakeHeadlessSync = fake): Promise<string> {
  const token = await signInForLink(context(service), { ...ACCOUNT, mfaCode: "" });
  if (!token.ok) throw new Error(token.error);
  return token.value;
}

async function e2eeKeyHex(password = E2EE.password): Promise<string> {
  return toHex(await deriveVaultKey(password, E2EE.salt));
}

async function pick(userId: string, paths: string[]) {
  expect((await saveSharedFolders(database.db, { userId, paths, knownFolders: FOLDERS, now: clock.now() })).ok).toBe(true);
}

describe("connecting a remote sync vault", () => {
  it("signs in, asks for the 2FA code when the account has one, and refuses bad input before calling the service", async () => {
    const withCode = createFakeHeadlessSync({ ...ACCOUNT, mfaCode: "424242", vaults: [STANDARD], socketHost: "sync-7.obsidian.md" });
    const call = (input: { email: string; password: string; mfaCode: string }) => signInForLink(context(withCode), input);
    expect(await call({ ...ACCOUNT, mfaCode: "" })).toEqual({ ok: false, error: "vault.headless_mfa_required" });
    expect(await call({ ...ACCOUNT, mfaCode: "111111" })).toEqual({ ok: false, error: "vault.headless_mfa_refused" });
    expect(await call({ ...ACCOUNT, password: "wrong", mfaCode: "424242" })).toEqual({ ok: false, error: "vault.headless_sign_in_refused" });
    expect(await call({ email: " ", password: "x", mfaCode: "" })).toEqual({ ok: false, error: "vault.headless_sign_in_invalid" });
    expect(await call({ ...ACCOUNT, mfaCode: "12ab" })).toEqual({ ok: false, error: "vault.headless_sign_in_invalid" });
    expect((await call({ ...ACCOUNT, mfaCode: " 424242 " })).ok).toBe(true);
  });

  it("lists the account's vaults with their encryption and never a password", async () => {
    const listed = await listVaultsForLink(context(), await signIn());
    expect(listed).toEqual({
      ok: true,
      value: [
        { id: "vault-std", name: "Garden notes", encryption: "standard", encryptionVersion: 3, salt: "salt-std", isSupported: true },
        { id: "vault-e2e", name: "Private", encryption: "e2ee", encryptionVersion: 3, salt: "salt-e2e", isSupported: true },
      ],
    });
    expect(JSON.stringify(listed)).not.toContain(STANDARD.password);
    expect(await listVaultsForLink(context(), "signed-out-token-0000")).toEqual({ ok: false, error: "vault.headless_link_expired" });
  });

  it("connects a standard vault with the key derived from its managed password and seals the session to the account", async () => {
    const token = await signIn();
    const connected = await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: STANDARD.id, keyHex: null });
    if (!connected.ok) throw new Error(connected.error);
    const stored = await findSource(database.db, aliceId);
    expect(stored).toMatchObject({ kind: "headless-sync", status: "connected", vaultId: "vault-std", vaultName: "Garden notes", host: "sync-7.obsidian.md", salt: "salt-std", encryption: "standard", encryptionVersion: 3 });
    if (stored?.kind !== "headless-sync") throw new Error("not stored");
    expect(getSourceLabel(stored)).toBe("Garden notes (sync)");
    // Neither the token, the key nor any password is in the clear in the row.
    const row = await database.db.execute(sql`SELECT * FROM vault.sources WHERE user_id = ${aliceId}`);
    const raw = JSON.stringify(row.rows);
    const key = await deriveVaultKey(STANDARD.password, STANDARD.salt);
    for (const secret of [token, toHex(key), STANDARD.password, ACCOUNT.password]) expect(raw).not.toContain(secret);
    expect(openHeadlessSyncCredentials(settings.keyring, aliceId, stored.sealedCredentials)).toEqual({ token, key });
    expect(openHeadlessSyncCredentials(settings.keyring, bobId, stored.sealedCredentials)).toBeNull();
  });

  it("connects an end-to-end vault only with the browser's key, and refuses a key from a wrong password", async () => {
    const token = await signIn();
    expect(await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: E2EE.id, keyHex: null })).toEqual({ ok: false, error: "vault.headless_key_missing" });
    expect(await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: E2EE.id, keyHex: "abcd" })).toEqual({ ok: false, error: "vault.headless_key_missing" });
    expect(await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: E2EE.id, keyHex: await e2eeKeyHex("a guess") })).toEqual({ ok: false, error: "vault.headless_key_refused" });
    expect(await findSource(database.db, aliceId)).toBeNull();
    const connected = await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: E2EE.id, keyHex: await e2eeKeyHex() });
    expect(connected.ok && connected.value).toMatchObject({ kind: "headless-sync", encryption: "e2ee", vaultName: "Private" });
  });

  it("refuses an unknown vault, a refused session and a socket host off the allow-list", async () => {
    const token = await signIn();
    expect(await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: "vault-none", keyHex: null })).toEqual({ ok: false, error: "vault.headless_vault_not_found" });
    expect(await connectHeadlessSyncVault(context(), aliceId, { token: "signed-out-token-0000", vaultId: STANDARD.id, keyHex: null })).toEqual({ ok: false, error: "vault.headless_link_expired" });
    const offList = createFakeHeadlessSync({ ...ACCOUNT, vaults: [STANDARD], socketHost: "metadata.attacker.test" });
    const offToken = await signIn(offList);
    const listed = await listVaultsForLink(context(offList), offToken);
    expect(listed.ok && listed.value.map((vault) => vault.isSupported)).toEqual([false]);
    expect(await connectHeadlessSyncVault(context(offList), aliceId, { token: offToken, vaultId: STANDARD.id, keyHex: null })).toEqual({ ok: false, error: "vault.headless_vault_unsupported" });
    expect(offList.socketLog).toEqual([]);
  });

  it("keeps the picks when the same vault is connected again and drops them for another vault or kind", async () => {
    const token = await signIn();
    expect((await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: STANDARD.id, keyHex: null })).ok).toBe(true);
    await pick(aliceId, ["Work"]);
    expect((await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: STANDARD.id, keyHex: null })).ok).toBe(true);
    expect((await listSharedFolders(database.db, aliceId)).map((folder) => folder.path)).toEqual(["Work"]);
    expect((await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: E2EE.id, keyHex: await e2eeKeyHex() })).ok).toBe(true);
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    await pick(aliceId, ["Work"]);
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: clock.now() });
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    expect(await findSource(database.db, aliceId)).toMatchObject({ kind: "github", repositoryFullName: "alice/notes" });
  });

  it("is held by the database too: a sync row needs every sync field and no other kind's", async () => {
    const fields = sql`headless_vault_id, headless_vault_name, headless_host, headless_salt, headless_encryption, headless_encryption_version`;
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, ${fields}, connected_at, checked_at)
        VALUES (${aliceId}, 'headless-sync', 'connected', 'v1', 'Notes', 'sync-1.example.test', 'salt', 'standard', 3, now(), now())`),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, ${fields}, headless_credentials, dropbox_folder, connected_at, checked_at)
        VALUES (${aliceId}, 'headless-sync', 'connected', 'v1', 'Notes', 'sync-1.example.test', 'salt', 'standard', 3, 'v1.k.aa.bb', '/Vault', now(), now())`),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, ${fields}, headless_credentials, connected_at, checked_at)
        VALUES (${aliceId}, 'headless-sync', 'connected', 'v1', 'Notes', 'sync-1.example.test', 'salt', 'standard', 1, 'v1.k.aa.bb', now(), now())`),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, ${fields}, headless_credentials, connected_at, checked_at)
        VALUES (${aliceId}, 'headless-sync', 'connected', 'v1', 'Notes', 'sync-1.example.test/x', 'salt', 'standard', 3, 'v1.k.aa.bb', now(), now())`),
    ).rejects.toThrow();
  });

  it("exports the vault's name and encryption mode, never the session, the key, the host or the salt", async () => {
    const token = await signIn();
    expect((await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: STANDARD.id, keyHex: null })).ok).toBe(true);
    const exported = await exportVaultUserData({ db: database.db, clock, config }, aliceId);
    if (!exported.ok) throw new Error("export failed");
    expect(exported.value.source).toMatchObject({ kind: "headless-sync", vaultName: "Garden notes", encryption: "standard", status: "connected" });
    const raw = JSON.stringify(exported.value);
    for (const secret of [token, "salt-std", "sync-7.obsidian.md", "vault-std", "v1."]) expect(raw).not.toContain(secret);
  });

  it("holds a signed-in session for ten minutes, for its own account only", () => {
    const sealed = sealPendingToken({ settings, clock }, aliceId, "fictional-session-token");
    expect(sealed).not.toContain("fictional-session-token");
    expect(openPendingToken({ settings, clock }, aliceId, sealed)).toBe("fictional-session-token");
    expect(openPendingToken({ settings, clock }, bobId, sealed)).toBeNull();
    expect(openPendingToken({ settings, clock }, aliceId, undefined)).toBeNull();
    expect(openPendingToken({ settings, clock }, aliceId, "v1.k.aa.bb")).toBeNull();
    clock.advance(10 * 60 * 1000);
    expect(openPendingToken({ settings, clock }, aliceId, sealed)).toBe("fictional-session-token");
    clock.advance(1);
    expect(openPendingToken({ settings, clock }, aliceId, sealed)).toBeNull();
  });

  it("ends the session at the service on disconnect", async () => {
    const token = await signIn();
    const connected = await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: STANDARD.id, keyHex: null });
    if (!connected.ok) throw new Error(connected.error);
    expect(fake.tokens.has(token)).toBe(true);
    expect(await signOutHeadlessSyncSource({ settings, fetch: createFakeSyncFetch(fake) }, connected.value)).toBe(true);
    expect(fake.tokens.has(token)).toBe(false);
  });

  it("reads only its own codes from a URL", () => {
    expect([readHeadlessSyncLinkError("vault.headless_key_refused"), readHeadlessSyncLinkError("<script>"), readHeadlessSyncLinkError(7)]).toEqual(["vault.headless_key_refused", null, null]);
  });
});

describe("syncing a remote sync vault", () => {
  function handlers() {
    return createVaultSyncJobHandlers({
      storage: { storage: createMemoryStorage(), keySecret: SECRET },
      openSource: createSourceOpener({
        github: { kind: "unconfigured" },
        s3: { kind: "unconfigured" },
        dropbox: { kind: "unconfigured" },
        headlessSync: settings,
        headlessSyncSocketFactory: createFakeSocketFactory(fake),
      }),
    });
  }

  async function sync(trigger: "webhook" | "schedule", handlerSet = handlers()) {
    await enqueueVaultSync({ db: database.db, clock, config }, { userId: aliceId, trigger });
    return runDueJobs({ db: database.db, clock, config }, { handlers: handlerSet, queues: [VAULT_SYNC_QUEUE], random: () => 0 });
  }

  it("copies the picked notes of an end-to-end vault, follows a change and stops when the session is gone", async () => {
    const token = await signIn();
    expect((await connectHeadlessSyncVault(context(), aliceId, { token, vaultId: E2EE.id, keyHex: await e2eeKeyHex() })).ok).toBe(true);
    await fake.write(E2EE.id, "Personal/Diary.md", "# Diary");
    await pick(aliceId, ["Work"]);
    const handlerSet = handlers();
    await sync("schedule", handlerSet);
    expect((await listNotes(database.db, aliceId)).map((note) => note.path)).toEqual(["Work/Secret.md"]);

    const pullsBefore = fake.socketLog.filter((line) => line.startsWith("pull")).length;
    await sync("schedule", handlerSet);
    // Nothing changed: one listing session, no pull.
    expect(fake.socketLog.filter((line) => line.startsWith("pull")).length).toBe(pullsBefore);

    await fake.write(E2EE.id, "Work/Next.md", "# Next");
    await fake.remove(E2EE.id, "Work/Secret.md");
    await sync("schedule", handlerSet);
    expect((await listNotes(database.db, aliceId)).map((note) => note.path)).toEqual(["Work/Next.md"]);

    // The account signed this session out at the service (or changed its password there).
    await fake.signOut(token);
    await fake.write(E2EE.id, "Work/Later.md", "# Later");
    await sync("schedule", handlerSet);
    expect(await findSource(database.db, aliceId)).toMatchObject({ kind: "headless-sync", status: "disconnected" });
  });
});

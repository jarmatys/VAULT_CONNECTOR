// Connecting an S3 bucket on a test database against the in-memory S3: the probe before anything is stored, the key
// pair sealed to the account, picks kept or dropped when the source changes, the database's own rules for a bucket
// row, and the sync copying picked notes from the bucket, following a change and stopping on revoked keys.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { generateConnectionsKey } from "@softure-ai/connections/server";
import { createVaultTestDatabase, type TestDatabase } from "../../testing/test-database.ts";
import { createMemoryStorage } from "@softure-ai/files/testing";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../../softure.config.ts";
import { listSharedFolders, saveSharedFolders } from "../../folders/shared-folders.ts";
import { readS3SourceSettings, type S3SourceSettings } from "../../settings.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "../../sync/sync-jobs.ts";
import { listNotes } from "../../sync/sync-store.ts";
import { createFakeS3, type FakeS3 } from "../../testing/fake-s3.ts";
import { createSourceOpener } from "../open-source.ts";
import { findSource, getSourceLabel, saveGithubSource } from "../store.ts";
import { connectS3Source, type S3ConnectInput } from "./connect.ts";
import { openS3Credentials, VAULT_SOURCE_KEYS_ENV } from "./s3-credentials.ts";

const KEYS = { accessKeyId: "AKIAFICTIONAL0000002", secretAccessKey: "fictional-secret-for-connect-tests" };
const INPUT: S3ConnectInput = { endpoint: "http://127.0.0.1:9000/s3", region: "", bucket: "notes-bucket", prefix: "vault", ...KEYS };
const FOLDERS = new Set(["Work", "Personal"]);
const SECRET = "test-key-secret-0123456789abcdef0123";

let database: TestDatabase;
let clock: TestClock;
let s3: FakeS3;
let settings: S3SourceSettings;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(new Date("2026-11-17T12:00:30Z"));
  s3 = createFakeS3({ bucket: "notes-bucket", basePath: "/s3", ...KEYS });
  s3.put("vault/Work/Plan.md", "# Plan");
  s3.put("vault/Personal/Diary.md", "# Diary");
  settings = readS3SourceSettings({ [VAULT_SOURCE_KEYS_ENV]: generateConnectionsKey("test"), VAULT_S3_ALLOW_PRIVATE_ENDPOINTS: "1" });
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

function connect(userId: string, input: Partial<S3ConnectInput> = {}) {
  return connectS3Source({ db: database.db, clock, settings, fetch: s3.fetch }, userId, { ...INPUT, ...input });
}

async function pick(userId: string, paths: string[]) {
  expect((await saveSharedFolders(database.db, { userId, paths, knownFolders: FOLDERS, now: clock.now() })).ok).toBe(true);
}

describe("connecting an S3 bucket", () => {
  it("probes the bucket, then stores the location and only a sealed key pair that opens for this account alone", async () => {
    const connected = await connect(aliceId);
    if (!connected.ok) throw new Error(connected.error);
    expect(s3.calls.list).toBe(1);
    const stored = await findSource(database.db, aliceId);
    expect(stored).toMatchObject({ kind: "s3", status: "connected", endpoint: "http://127.0.0.1:9000/s3/", region: "auto", bucket: "notes-bucket", prefix: "vault" });
    if (stored?.kind !== "s3" || settings.kind !== "configured") throw new Error("no S3 source");
    expect(getSourceLabel(stored)).toBe("notes-bucket/vault (127.0.0.1:9000)");
    const raw = await database.db.execute<{ row: string }>(sql`SELECT row_to_json(s)::text AS row FROM vault.sources s WHERE user_id = ${aliceId}`);
    expect(raw.rows[0]?.row).not.toContain(KEYS.secretAccessKey);
    expect(raw.rows[0]?.row).not.toContain(KEYS.accessKeyId);
    expect(openS3Credentials(settings.keyring, aliceId, stored.sealedCredentials)).toEqual(KEYS);
    expect(openS3Credentials(settings.keyring, bobId, stored.sealedCredentials)).toBeNull();
  });

  it.each([
    [{ secretAccessKey: "not-the-secret" }, "vault.s3_keys_refused"],
    [{ bucket: "other-bucket" }, "vault.s3_bucket_not_found"],
    [{ accessKeyId: "has space" }, "vault.s3_keys_invalid"],
    [{ secretAccessKey: "" }, "vault.s3_keys_invalid"],
    [{ prefix: "../up" }, "vault.s3_prefix_invalid"],
  ])("refuses %o with %s and stores nothing", async (input, code) => {
    const connected = await connect(aliceId, input);
    expect(!connected.ok && connected.error).toBe(code);
    expect(await findSource(database.db, aliceId)).toBeNull();
  });

  it("maps an outage to unavailable and a non-S3 answer to unexpected", async () => {
    s3.fail("list", 500);
    const outage = await connect(aliceId);
    s3.fail("list", 400);
    const odd = await connect(aliceId);
    expect([!outage.ok && outage.error, !odd.ok && odd.error]).toEqual(["vault.s3_unavailable", "vault.s3_unexpected"]);
  });

  it("refuses a private endpoint unless the instance opts in, and everything without a keyring", async () => {
    settings = readS3SourceSettings({ [VAULT_SOURCE_KEYS_ENV]: generateConnectionsKey("test") });
    const privateEndpoint = await connect(aliceId, { endpoint: "https://10.0.0.5" });
    settings = readS3SourceSettings({});
    const unconfigured = await connect(aliceId);
    expect([!privateEndpoint.ok && privateEndpoint.error, !unconfigured.ok && unconfigured.error]).toEqual(["vault.s3_endpoint_private", "vault.s3_unconfigured"]);
    expect(s3.calls.list).toBe(0);
  });

  it("keeps picks for new keys to the same location and drops them for another location or kind", async () => {
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: clock.now() });
    await pick(aliceId, ["Work"]);
    await connect(aliceId);
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    await pick(aliceId, ["Work"]);
    await connect(aliceId, { prefix: "/vault/" });
    expect((await listSharedFolders(database.db, aliceId)).map((folder) => folder.path)).toEqual(["Work"]);
    s3.put("other/Work/A.md", "# A");
    await connect(aliceId, { prefix: "other" });
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    await pick(aliceId, ["Work"]);
    await saveGithubSource(database.db, { userId: aliceId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: clock.now() });
    expect(await listSharedFolders(database.db, aliceId)).toEqual([]);
    expect(await findSource(database.db, aliceId)).toMatchObject({ kind: "github", repositoryFullName: "alice/notes" });
  });

  it("is held by the database too: a bucket row needs every bucket field and no repository field", async () => {
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, s3_endpoint, s3_region, s3_bucket, s3_prefix, connected_at, checked_at)
        VALUES (${aliceId}, 's3', 'connected', 'https://store.example.com/', 'auto', 'notes', '', now(), now())`),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`INSERT INTO vault.sources (user_id, kind, status, s3_endpoint, s3_region, s3_bucket, s3_prefix, s3_credentials,
          repository_full_name, connected_at, checked_at)
        VALUES (${aliceId}, 's3', 'connected', 'https://store.example.com/', 'auto', 'notes', '', 'v1.k.aa.bb', 'alice/notes', now(), now())`),
    ).rejects.toThrow();
  });
});

describe("syncing an S3 bucket", () => {
  function handlers() {
    return createVaultSyncJobHandlers({
      storage: { storage: createMemoryStorage(), keySecret: SECRET },
      openSource: createSourceOpener({ github: { kind: "unconfigured" }, s3: settings, s3Fetch: s3.fetch }),
    });
  }

  async function sync(trigger: "webhook" | "schedule", handlerSet = handlers()) {
    await enqueueVaultSync({ db: database.db, clock, config }, { userId: aliceId, trigger });
    return runDueJobs({ db: database.db, clock, config }, { handlers: handlerSet, queues: [VAULT_SYNC_QUEUE], random: () => 0 });
  }

  it("copies the picked notes, notices a change at the next check and stops on revoked keys", async () => {
    expect((await connect(aliceId)).ok).toBe(true);
    await pick(aliceId, ["Work"]);
    const handlerSet = handlers();
    await sync("webhook", handlerSet);
    expect((await listNotes(database.db, aliceId)).map((note) => note.path)).toEqual(["Work/Plan.md"]);

    const listsBefore = s3.calls.list;
    await sync("schedule", handlerSet);
    // Nothing changed: one listing call for the cursor, no read.
    expect(s3.calls.list - listsBefore).toBe(1);

    s3.put("vault/Work/Next.md", "# Next");
    s3.remove("vault/Work/Plan.md");
    await sync("schedule", handlerSet);
    expect((await listNotes(database.db, aliceId)).map((note) => note.path)).toEqual(["Work/Next.md"]);

    s3.fail("list", 403);
    s3.put("vault/Work/Later.md", "# Later");
    await sync("schedule", handlerSet);
    expect(await findSource(database.db, aliceId)).toMatchObject({ kind: "s3", status: "disconnected" });
  });
});

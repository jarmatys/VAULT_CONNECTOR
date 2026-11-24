// The reviewer command's account on a test database against the in-memory S3 holding the fictional fixture vault from
// content/reviewer-vault: it signs in with the printed password, shares every top folder, copies the notes on the next
// sync, has access for exactly the days asked, and a failure or a removal leaves no account behind.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createTestAccount } from "@softure-ai/auth/testing";
import { loginUser } from "@softure-ai/auth/server";
import { EMAIL_KEY_SECRET_ENV } from "@softure-ai/privacy/server";
import { getEntitlement } from "@softure-ai/billing/server";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { generateConnectionsKey } from "@softure-ai/connections/server";
import { createFakeS3, createMemoryStorage, type FakeS3 } from "@softure-ai/files/testing";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../softure.config.ts";
import { listSharedFolders } from "../vault/folders/shared-folders.ts";
import { readS3SourceSettings, type S3SourceSettings } from "../vault/settings.ts";
import { createSourceOpener } from "../vault/sources/open-source.ts";
import { VAULT_SOURCE_KEYS_ENV } from "../vault/sources/s3/s3-credentials.ts";
import { createVaultSyncJobHandlers, VAULT_SYNC_QUEUE } from "../vault/sync/sync-jobs.ts";
import { listNotes } from "../vault/sync/sync-store.ts";
import { createVaultTestDatabase, type TestDatabase } from "../vault/testing/test-database.ts";
import { createReviewerAccount, removeReviewerAccount, REVIEWER_MAX_DAYS, type ReviewerContext } from "./reviewer-account.ts";

const FIXTURE_DIR = join(import.meta.dirname, "../../content/reviewer-vault");
const KEYS = { accessKeyId: "AKIAFICTIONALREVIEW1", secretAccessKey: "fictional-secret-for-reviewer-tests" };
const VAULT = { endpoint: "http://127.0.0.1:9000/s3", region: "", bucket: "reviewer-vault", prefix: "", ...KEYS };
const EMAIL = "reviewer@example.com";
const NOW = new Date("2026-11-18T09:00:00Z");

let database: TestDatabase;
let clock: TestClock;
let s3: FakeS3;
let settings: S3SourceSettings;

function listFixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFixtureFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

beforeEach(async () => {
  // privacy keys the consents of the reviewer's address with it when it erases the account.
  vi.stubEnv(EMAIL_KEY_SECRET_ENV, "test-email-key-secret-0123456789abcdef");
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(NOW);
  s3 = createFakeS3({ bucket: VAULT.bucket, basePath: "/s3", ...KEYS });
  for (const file of listFixtureFiles(FIXTURE_DIR)) s3.put(relative(FIXTURE_DIR, file).split(sep).join("/"), readFileSync(file));
  settings = readS3SourceSettings({ [VAULT_SOURCE_KEYS_ENV]: generateConnectionsKey("test"), VAULT_S3_ALLOW_PRIVATE_ENDPOINTS: "1" });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await database.close();
});

function context(): ReviewerContext {
  return { db: database.db, clock, config, s3: settings, fetch: s3.fetch };
}

async function sync() {
  const handlers = createVaultSyncJobHandlers({
    storage: { storage: createMemoryStorage(), keySecret: "test-key-secret-0123456789abcdef0123" },
    openSource: createSourceOpener({ github: { kind: "unconfigured" }, s3: settings, dropbox: { kind: "unconfigured" }, headlessSync: { kind: "unconfigured" }, s3Fetch: s3.fetch }),
  });
  return runDueJobs({ db: database.db, clock, config }, { handlers, queues: [VAULT_SYNC_QUEUE], random: () => 0 });
}

async function countUsers(): Promise<number> {
  const rows = await database.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM auth.users`);
  return rows.rows[0]?.count ?? -1;
}

describe("the reviewer account", () => {
  it("signs in with the printed password, shares every top folder and copies the fixture notes on the first sync", async () => {
    const created = await createReviewerAccount(context(), { email: EMAIL, days: 14, vault: VAULT });
    if (!created.ok) throw new Error(created.error);
    expect(created.value.email).toBe(EMAIL);
    expect(created.value.sharedFolders).toEqual(["Meetings", "Projects", "Reading", "Recipes"]);
    expect((await listSharedFolders(database.db, created.value.userId)).map((folder) => folder.path)).toEqual(["Meetings", "Projects", "Reading", "Recipes"]);

    const login = await loginUser({ db: database.db, clock, config }, { email: EMAIL, password: created.value.password, clientKey: "test" });
    expect(login.ok).toBe(true);

    await sync();
    expect((await listNotes(database.db, created.value.userId)).map((note) => note.path).sort()).toEqual([
      "Meetings/2026-03-02 Seed swap.md",
      "Projects/Garden Co-op/Plan.md",
      "Projects/Garden Co-op/Watering rota.md",
      "Reading/A note that gives orders.md",
      "Reading/Notes on composting.md",
      "Recipes/Tomato soup.md",
    ]);
  });

  it("gives access for exactly the days asked", async () => {
    const created = await createReviewerAccount(context(), { email: EMAIL, days: 30, vault: VAULT });
    if (!created.ok) throw new Error(created.error);
    expect(created.value.accessEndsAt).toEqual(new Date("2026-12-18T09:00:00Z"));
    const entitlement = await getEntitlement({ db: database.db, clock, config }, created.value.userId);
    expect(entitlement).toMatchObject({ status: "trial", endsAt: new Date("2026-12-18T09:00:00Z") });
  });

  it.each([0, -1, 1.5, REVIEWER_MAX_DAYS + 1])("refuses %s days before creating anything", async (days) => {
    expect(await createReviewerAccount(context(), { email: EMAIL, days, vault: VAULT })).toEqual({ ok: false, error: "reviewer.days_invalid" });
    expect(await countUsers()).toBe(0);
  });

  it("refuses an address that already has an account and leaves that account alone", async () => {
    await createTestAccount(database.db, { email: EMAIL, password: "a long test password" });
    expect(await createReviewerAccount(context(), { email: EMAIL, days: 14, vault: VAULT })).toEqual({ ok: false, error: "reviewer.email_taken" });
    expect(await countUsers()).toBe(1);
  });

  it("erases the new account again when the bucket refuses the keys", async () => {
    const result = await createReviewerAccount(context(), { email: EMAIL, days: 14, vault: { ...VAULT, secretAccessKey: "not-the-secret" } });
    expect(result).toEqual({ ok: false, error: "reviewer.vault_unreachable" });
    expect(await countUsers()).toBe(0);
  });

  it("erases the new account again when the bucket holds no folder of notes", async () => {
    const empty = createFakeS3({ bucket: VAULT.bucket, basePath: "/s3", ...KEYS });
    empty.put("README.md", "# Only a top-level note");
    const result = await createReviewerAccount({ ...context(), fetch: empty.fetch }, { email: EMAIL, days: 14, vault: VAULT });
    expect(result).toEqual({ ok: false, error: "reviewer.vault_empty" });
    expect(await countUsers()).toBe(0);
  });

  it("removes the account by its address, and answers not found for an unknown one", async () => {
    const created = await createReviewerAccount(context(), { email: EMAIL, days: 14, vault: VAULT });
    if (!created.ok) throw new Error(created.error);
    expect(await removeReviewerAccount({ db: database.db, clock, config }, " Reviewer@Example.com ")).toEqual({ ok: true, value: created.value.userId });
    expect(await countUsers()).toBe(0);
    expect(await removeReviewerAccount({ db: database.db, clock, config }, EMAIL)).toEqual({ ok: false, error: "reviewer.not_found" });
  });
});

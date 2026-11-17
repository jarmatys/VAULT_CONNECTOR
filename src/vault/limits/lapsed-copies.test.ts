// The grace period after access ends (VC-15, FR-19) on a test database: the copies and the index stay while it runs,
// the daily purge removes them (rows, passages, queued objects) once it is over and keeps the source and the picks, a
// sync copies nothing back while access stays over, and a payment copies everything back. An unlimited (self-hosted)
// instance purges nothing.
import { createTestAccount } from "@softure-ai/auth/testing";
import { grantPlanManually } from "@softure-ai/billing/server";
import { createTestClock, type ModuleContext, type TestClock } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { enqueueJob } from "@softure-ai/jobs/server";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { createVaultEraseJobHandlers, listQueuedErasures, VAULT_ERASE_QUEUE } from "../erase/erase-jobs.ts";
import { ERASE_DELAY_SECONDS } from "../erase/erase-queues.ts";
import { saveSharedFolders } from "../folders/shared-folders.ts";
import { runIndexStep } from "../index/index-step.ts";
import { saveGithubSource } from "../sources/store.ts";
import { createFakeSource } from "../testing/fake-source.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_CHECK_QUEUE, VAULT_SYNC_QUEUE } from "../sync/sync-jobs.ts";
import { listNotes } from "../sync/sync-store.ts";
import { getNoteCaps, LAPSED_CAPS } from "./account-limits.ts";
import { findEndedAccess } from "./ended-access.ts";
import { createVaultPurgeJobHandlers, listLapsedAccounts, purgeLapsedAccounts, VAULT_PURGE_QUEUE } from "./lapsed-copies.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const T0 = new Date("2026-11-17T12:00:00Z");
/** The trial of an account created at T0 ends on 2026-12-01; the grace period on 2026-12-31. */
const IN_GRACE = new Date("2026-12-15T09:00:00Z");
const PAST_GRACE = new Date("2027-01-02T09:00:00Z");
const LIMITED = { PLAN_LIMITS: undefined };
const UNLIMITED = { PLAN_LIMITS: "unlimited" };

let database: TestDatabase;
let clock: TestClock;
let storage: MemoryStorage;
let ctx: ModuleContext<Queryable>;
let userId: string;
let sourceId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(T0);
  storage = createMemoryStorage();
  ctx = { db: database.db, clock, config };
  userId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password", createdAt: T0 })).id;
  sourceId = (await saveGithubSource(database.db, { userId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: T0 })).id;
  expect((await saveSharedFolders(database.db, { userId, paths: ["Work"], knownFolders: new Set(["Work"]), now: T0 })).ok).toBe(true);
});

afterEach(async () => {
  await database.close();
});

const source = createFakeSource({ "Work/A.md": "# A\n\nalpha", "Work/B.md": "# B\n\nbeta", "Work/C.md": "# C\n\ngamma" });

const syncHandlers = () =>
  createVaultSyncJobHandlers({ storage: { storage, keySecret: SECRET }, openSource: (stored) => (stored.id === sourceId ? source : null), getCaps: getNoteCaps });

async function sync(): Promise<void> {
  clock.advance(60_000);
  await enqueueVaultSync(ctx, { userId, trigger: "schedule" });
  const report = await runDueJobs(ctx, { handlers: syncHandlers(), queues: [VAULT_SYNC_QUEUE, VAULT_SYNC_CHECK_QUEUE], random: () => 0 });
  expect(report.failed).toBe(0);
}

async function index(): Promise<void> {
  const indexContext = { db: database.db, clock, storage, keySecret: SECRET, embedder: null, continueIndex: () => Promise.resolve() };
  expect(await runIndexStep(indexContext, { userId })).toMatchObject({ kind: "indexed", notes: 3 });
}

async function countRows(): Promise<Record<string, number>> {
  const result = await database.db.execute<{ notes: number; passages: number; sources: number; folders: number; runs: number }>(sql`
    SELECT (SELECT count(*)::int FROM vault.notes WHERE user_id = ${userId}) AS notes,
      (SELECT count(*)::int FROM vault.passages WHERE user_id = ${userId}) AS passages,
      (SELECT count(*)::int FROM vault.sources WHERE user_id = ${userId}) AS sources,
      (SELECT count(*)::int FROM vault.shared_folders WHERE user_id = ${userId}) AS folders,
      (SELECT count(*)::int FROM vault.sync_runs WHERE user_id = ${userId}) AS runs`);
  return { ...result.rows[0] };
}

/** Copies and indexes the three notes while the trial runs. */
async function copyDuringTrial(): Promise<void> {
  await sync();
  await index();
  expect(storage.objects().size).toBe(3);
}

describe("an account whose access ended", () => {
  it("keeps its copies and index during the grace period", async () => {
    await copyDuringTrial();
    clock.set(IN_GRACE);
    expect(await findEndedAccess(ctx, userId, LIMITED)).toEqual({
      since: new Date("2026-12-01T00:00:00Z"),
      removeAt: new Date("2026-12-31T00:00:00Z"),
      isPastGrace: false,
    });
    expect(await listLapsedAccounts(ctx, { limit: 10 })).toEqual([]);
    expect(await purgeLapsedAccounts(ctx, { readKeySecret: () => SECRET, env: LIMITED })).toEqual([]);
    await sync();
    expect((await listNotes(database.db, userId)).map((note) => note.path)).toEqual(["Work/A.md", "Work/B.md", "Work/C.md"]);
    expect((await countRows()).passages).toBeGreaterThan(0);
  });

  it("loses its copies, index and objects after the grace period, and keeps its source, picks and run history", async () => {
    await copyDuringTrial();
    const before = await countRows();
    clock.set(PAST_GRACE);
    expect(await listLapsedAccounts(ctx, { limit: 10 })).toEqual([userId]);
    expect(await purgeLapsedAccounts(ctx, { readKeySecret: () => SECRET, env: LIMITED })).toEqual([userId]);
    expect(await countRows()).toEqual({ notes: 0, passages: 0, sources: 1, folders: 1, runs: before.runs });
    expect(await listQueuedErasures(database.db, { limit: 10 })).toHaveLength(3);
    expect(await listLapsedAccounts(ctx, { limit: 10 })).toEqual([]);

    clock.advance((ERASE_DELAY_SECONDS + 1) * 1000);
    const erased = await runDueJobs(ctx, { handlers: createVaultEraseJobHandlers({ storage }), queues: [VAULT_ERASE_QUEUE], random: () => 0 });
    expect(erased.failed).toBe(0);
    expect(storage.objects().size).toBe(0);
  });

  it("gets nothing copied back by a sync while its access stays over", async () => {
    await copyDuringTrial();
    clock.set(PAST_GRACE);
    expect(await getNoteCaps(ctx, userId)).toEqual(LAPSED_CAPS);
    await purgeLapsedAccounts(ctx, { readKeySecret: () => SECRET, env: LIMITED });
    await sync();
    expect(await listNotes(database.db, userId)).toEqual([]);
    expect(await listQueuedErasures(database.db, { limit: 10 })).toHaveLength(3);
  });

  it("gets every note copied back once it pays", async () => {
    await copyDuringTrial();
    clock.set(PAST_GRACE);
    await purgeLapsedAccounts(ctx, { readKeySecret: () => SECRET, env: LIMITED });
    expect((await grantPlanManually(ctx, { userId, planId: "monthly", adminId: null })).ok).toBe(true);
    await sync();
    expect((await listNotes(database.db, userId)).map((note) => note.path)).toEqual(["Work/A.md", "Work/B.md", "Work/C.md"]);
    expect(await findEndedAccess(ctx, userId, LIMITED)).toBeNull();
  });

  it("is purged by the daily job", async () => {
    await copyDuringTrial();
    clock.set(PAST_GRACE);
    await enqueueJob(ctx, { queue: VAULT_PURGE_QUEUE, payload: {}, origin: "test" });
    const report = await runDueJobs(ctx, {
      handlers: createVaultPurgeJobHandlers({ readKeySecret: () => SECRET, env: LIMITED }),
      queues: [VAULT_PURGE_QUEUE],
      random: () => 0,
    });
    expect(report.failed).toBe(0);
    expect((await countRows()).notes).toBe(0);
  });
});

describe("an unlimited instance", () => {
  it("never ends access and purges nothing", async () => {
    await copyDuringTrial();
    clock.set(PAST_GRACE);
    expect(await findEndedAccess(ctx, userId, UNLIMITED)).toBeNull();
    expect(await purgeLapsedAccounts(ctx, { readKeySecret: () => SECRET, env: UNLIMITED })).toEqual([]);
    expect((await countRows()).notes).toBe(3);
  });
});

// The plan's limits through the whole pipeline on a test database: billing answers each state's limits, the sync run by
// the jobs copies only what fits the plan (so the index never sees the rest) and says how many notes it left out, a
// granted plan re-plans the sync and copies the rest, and the totals the panel shows count what was copied.
import { createTestAccount } from "@softure-ai/auth/testing";
import { grantPlanManually } from "@softure-ai/billing/server";
import { createTestClock, type ModuleContext, type TestClock } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { PAID_LIMITS, READ_ONLY_LIMITS, TRIAL_LIMITS } from "../../lib/plans.ts";
import { saveSharedFolders } from "../folders/shared-folders.ts";
import { runIndexStep } from "../index/index-step.ts";
import { getIndexProgress } from "../index/index-store.ts";
import { saveGithubSource } from "../sources/store.ts";
import { createFakeSource, type FakeSource } from "../testing/fake-source.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_CHECK_QUEUE, VAULT_SYNC_QUEUE } from "../sync/sync-jobs.ts";
import { findLatestRun, listNotes } from "../sync/sync-store.ts";
import { getAccountLimits, getCopyTotals, getNoteCaps, toMebibytes, toNoteCaps, type NoteCaps } from "./account-limits.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const T0 = new Date("2026-11-17T12:00:00Z");

let database: TestDatabase;
let clock: TestClock;
let storage: MemoryStorage;
let ctx: ModuleContext<Queryable>;
let sources: Map<string, FakeSource>;
let userId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  clock = createTestClock(T0);
  storage = createMemoryStorage();
  ctx = { db: database.db, clock, config };
  sources = new Map();
  userId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password", createdAt: T0 })).id;
});

afterEach(async () => {
  await database.close();
});

/** The sync's handlers with caps from billing, or the given fixed caps. */
function handlers(caps?: NoteCaps) {
  return createVaultSyncJobHandlers({
    storage: { storage, keySecret: SECRET },
    openSource: (source) => sources.get(source.id) ?? null,
    getCaps: caps === undefined ? getNoteCaps : () => Promise.resolve(caps),
  });
}

async function connect(files: Record<string, string>): Promise<FakeSource> {
  const stored = await saveGithubSource(database.db, { userId, installationId: 7, repository: { id: 501, fullName: "alice/notes", defaultBranch: "main" }, now: T0 });
  const source = createFakeSource(files);
  sources.set(stored.id, source);
  expect((await saveSharedFolders(database.db, { userId, paths: ["Work"], knownFolders: new Set(["Work"]), now: T0 })).ok).toBe(true);
  return source;
}

async function sync(caps?: NoteCaps): Promise<void> {
  clock.advance(60_000); // each run starts later, so the latest run is unambiguous
  await enqueueVaultSync(ctx, { userId, trigger: "webhook" });
  const report = await runDueJobs(ctx, { handlers: handlers(caps), queues: [VAULT_SYNC_QUEUE], random: () => 0 });
  expect(report.failed).toBe(0);
}

const FIVE_NOTES = { "Work/A.md": "# A", "Work/B.md": "# B", "Work/C.md": "# C", "Work/D.md": "# D", "Work/E.md": "# E" };

describe("the account's limits", () => {
  it("are the trial's on a new account, the plan's once one is granted, and the read-only ones once access ended", async () => {
    expect(await getAccountLimits(ctx, userId)).toEqual({ status: "trial", planId: null, limits: TRIAL_LIMITS });
    expect((await grantPlanManually(ctx, { userId, planId: "monthly", adminId: null })).ok).toBe(true);
    expect(await getAccountLimits(ctx, userId)).toEqual({ status: "paid", planId: "monthly", limits: PAID_LIMITS });
    clock.set(new Date("2027-02-01T00:00:00Z"));
    expect(await getAccountLimits(ctx, userId)).toEqual({ status: "read_only", planId: null, limits: READ_ONLY_LIMITS });
  });

  it("turn into caps in bytes, and are none for an unknown account", async () => {
    expect(toNoteCaps(TRIAL_LIMITS)).toEqual({ maxNotes: 5000, maxBytes: 500 * 1024 * 1024 });
    expect(toNoteCaps({ notes: null, storageMb: null, searches: null })).toEqual({ maxNotes: null, maxBytes: null });
    expect(await getNoteCaps(ctx, "00000000-0000-4000-8000-000000000000")).toEqual({ maxNotes: null, maxBytes: null });
  });

  it("show MiB with one decimal, rounded up", () => {
    expect([toMebibytes(0), toMebibytes(1), toMebibytes(1024 * 1024), toMebibytes(1.25 * 1024 * 1024)]).toEqual([0, 0.1, 1, 1.3]);
  });
});

describe("a sync over the plan's caps", () => {
  it("copies and indexes only the notes that fit, and records how many it left out", async () => {
    await connect(FIVE_NOTES);
    await sync({ maxNotes: 3, maxBytes: null });
    expect((await listNotes(database.db, userId)).map((note) => note.path)).toEqual(["Work/A.md", "Work/B.md", "Work/C.md"]);
    expect(storage.objects().size).toBe(3);
    expect(await findLatestRun(database.db, userId)).toMatchObject({ status: "succeeded", copied: 3, skippedOverLimit: 2 });
    expect(await getCopyTotals(database.db, userId)).toEqual({ notes: 3, bytes: 9 });
    const indexContext = { db: database.db, clock, storage, keySecret: SECRET, embedder: null, continueIndex: () => Promise.resolve() };
    expect(await runIndexStep(indexContext, { userId })).toMatchObject({ kind: "indexed", notes: 3 });
    expect(await getIndexProgress(database.db, { userId, model: "" })).toMatchObject({ notes: 3, indexed: 3 });
  });

  it("records a changed count over the caps even when nothing has to be copied", async () => {
    const source = await connect(FIVE_NOTES);
    await sync({ maxNotes: 5, maxBytes: null });
    expect(await findLatestRun(database.db, userId)).toMatchObject({ skippedOverLimit: 0, copied: 5 });
    source.write("Work/F.md", "# F");
    await sync({ maxNotes: 5, maxBytes: null });
    expect(await findLatestRun(database.db, userId)).toMatchObject({ status: "succeeded", plannedCopies: 0, skippedOverLimit: 1 });
    expect((await listNotes(database.db, userId)).map((note) => note.path)).not.toContain("Work/F.md");
  });

  it("copies the rest once a plan with larger caps is granted, without waiting for a push", async () => {
    await connect(FIVE_NOTES);
    await sync({ maxNotes: 2, maxBytes: null });
    expect(await getCopyTotals(database.db, userId)).toMatchObject({ notes: 2 });
    // Billing's caps from here: the grant asks for a full re-plan, the five-minute check runs it.
    expect((await grantPlanManually(ctx, { userId, planId: "yearly", adminId: null })).ok).toBe(true);
    clock.advance(60_000);
    await enqueueVaultSync(ctx, { userId, trigger: "schedule" });
    await runDueJobs(ctx, { handlers: handlers(), queues: [VAULT_SYNC_QUEUE, VAULT_SYNC_CHECK_QUEUE], random: () => 0 });
    expect(await getCopyTotals(database.db, userId)).toMatchObject({ notes: 5 });
    expect(await findLatestRun(database.db, userId)).toMatchObject({ status: "succeeded", skippedOverLimit: 0 });
  });
});

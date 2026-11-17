// The sync on a test database with a source in memory and a store in memory, run through the jobs as the worker runs
// them (`runDueJobs`): picked notes copied and nothing else, changes followed, unpicked copies removed, other accounts
// untouched, steps within their budget on a 5,000-note vault, a push seen by the five-minute check within ten minutes,
// keys without the account id, and the source's failures.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import { createTestDatabase, type TestDatabase } from "@softure-ai/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { listJobs, runDueJobs } from "@softure-ai/jobs/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveSharedFolders } from "../folders/shared-folders.ts";
import config from "../../../softure.config.ts";
import { deleteSource, findSource, saveGithubSource } from "../sources/store.ts";
import { createAccountNoteStorage } from "../storage/note-storage.ts";
import { createFakeSource, type FakeSource } from "../testing/fake-source.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "./sync-jobs.ts";
import { runSyncStep, type SyncContext } from "./sync-step.ts";
import { MAX_NOTE_BYTES } from "./sync-plan.ts";
import { acquireSyncLease, findLatestRun, listNotes, type StoredNote } from "./sync-store.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const T0 = new Date("2026-11-17T12:00:30Z");
const REPOSITORY = { id: 501, fullName: "alice/notes", defaultBranch: "main" };
const FOLDERS = new Set(["Work", "Work/Clients", "Personal", "Archive"]);

let database: TestDatabase;
let clock: TestClock;
let storage: MemoryStorage;
let sources: Map<string, FakeSource>;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createTestDatabase(config.modules);
  clock = createTestClock(T0);
  storage = createMemoryStorage();
  sources = new Map();
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

function jobsContext() {
  return { db: database.db, clock, config };
}

function handlers(limits: { maxFiles?: number } = {}) {
  return createVaultSyncJobHandlers({
    storage: { storage, keySecret: SECRET },
    openSource: (source) => sources.get(source.id) ?? null,
    limits,
  });
}

/** Connects the account to a fake vault and picks folders. */
async function connect(userId: string, files: Record<string, string>, picks: string[]): Promise<FakeSource> {
  const stored = await saveGithubSource(database.db, { userId, installationId: 7, repository: REPOSITORY, now: clock.now() });
  const source = createFakeSource(files);
  sources.set(stored.id, source);
  if (picks.length > 0) await pick(userId, picks);
  return source;
}

async function pick(userId: string, picks: string[]) {
  const saved = await saveSharedFolders(database.db, { userId, paths: picks, knownFolders: FOLDERS, now: clock.now() });
  expect(saved.ok).toBe(true);
}

async function sync(userId: string, limits: { maxFiles?: number } = {}) {
  await enqueueVaultSync(jobsContext(), { userId, trigger: "webhook" });
  return runDueJobs(jobsContext(), { handlers: handlers(limits), queues: [VAULT_SYNC_QUEUE], random: () => 0 });
}

async function readCopy(userId: string, path: string): Promise<string | null> {
  const bytes = await createAccountNoteStorage(storage, SECRET, userId).readNote(path);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

const paths = (notes: readonly StoredNote[]) => notes.map((note) => note.path);

const VAULT = {
  "Work/Plan.md": "---\ntitle: The plan\ntags: [work]\n---\nBody",
  "Work/Clients/Acme.md": "# Acme\nNotes",
  "Work/diagram.png": "binary",
  "Work/Board.excalidraw.md": "drawing",
  "Work/.trash/Old.md": "old",
  "Personal/Diary.md": "# Diary",
  "Inbox.md": "# Inbox",
};

describe("the first sync", () => {
  it("copies only the notes of picked folders, builds their table of contents and counts what it skipped", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    const report = await sync(aliceId);
    expect(report.failed).toBe(0);
    const notes = await listNotes(database.db, aliceId);
    expect(paths(notes)).toEqual(["Work/Clients/Acme.md", "Work/Plan.md"]);
    expect(notes.map(({ title, tags }) => ({ title, tags }))).toEqual([
      { title: "Acme", tags: [] },
      { title: "The plan", tags: ["work"] },
    ]);
    expect(await readCopy(aliceId, "Work/Clients/Acme.md")).toBe("# Acme\nNotes");
    expect(await readCopy(aliceId, "Personal/Diary.md")).toBeNull();
    expect(storage.objects().size).toBe(2);
    const run = await findLatestRun(database.db, aliceId);
    expect(run).toMatchObject({ status: "succeeded", plannedCopies: 2, copied: 2, removed: 0, skippedNotNote: 2, skippedTooLarge: 0 });
    expect((await findSource(database.db, aliceId)) === null).toBe(false);
  });

  it("copies nothing before a pick", async () => {
    await connect(aliceId, VAULT, []);
    await sync(aliceId);
    expect(await listNotes(database.db, aliceId)).toEqual([]);
    expect(storage.objects().size).toBe(0);
    expect(await findLatestRun(database.db, aliceId)).toBeNull();
  });

  it("skips and counts a note over the size limit instead of failing", async () => {
    const source = await connect(aliceId, { "Work/Plan.md": "# Plan" }, ["Work"]);
    source.writeSized("Work/Huge.md", MAX_NOTE_BYTES + 1);
    await sync(aliceId);
    expect(paths(await listNotes(database.db, aliceId))).toEqual(["Work/Plan.md"]);
    expect(await findLatestRun(database.db, aliceId)).toMatchObject({ status: "succeeded", skippedTooLarge: 1 });
  });

  it("writes keys that hold neither the account id nor a note path", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    for (const key of storage.objects().keys()) {
      expect(key).toMatch(/^v1\/[0-9a-f]{32}\/[0-9a-f]{64}$/);
      expect(key).not.toContain(aliceId);
      for (const part of aliceId.split("-")) expect(key).not.toContain(part);
    }
  });
});

describe("a later sync", () => {
  it("follows an added, changed, removed and renamed note and copies only what changed", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    const before = new Map((await listNotes(database.db, aliceId)).map((note) => [note.path, note]));
    clock.advance(60_000);
    source.write("Work/New.md", "# New");
    source.write("Work/Plan.md", "---\ntitle: Plan v2\n---\n");
    source.rename("Work/Clients/Acme.md", "Work/Clients/Acme Corp.md");
    source.remove("Work/diagram.png");
    const readsBefore = source.calls.readFile;
    await sync(aliceId);
    const notes = await listNotes(database.db, aliceId);
    expect(paths(notes)).toEqual(["Work/Clients/Acme Corp.md", "Work/New.md", "Work/Plan.md"]);
    expect(notes.find((note) => note.path === "Work/Plan.md")?.title).toBe("Plan v2");
    expect(notes.find((note) => note.path === "Work/Plan.md")?.changedAt).toEqual(clock.now());
    expect(before.get("Work/Plan.md")?.changedAt).toEqual(T0);
    expect(source.calls.readFile - readsBefore).toBe(3);
    expect(await readCopy(aliceId, "Work/Clients/Acme.md")).toBeNull();
    expect(storage.objects().size).toBe(3);
    expect(await findLatestRun(database.db, aliceId)).toMatchObject({ copied: 3, removed: 1 });
  });

  it("reads only the head when nothing moved", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    const listings = source.calls.listTree;
    await sync(aliceId);
    expect(source.calls.listTree).toBe(listings);
    expect(source.calls.getCursor).toBe(2);
  });

  it("removes the copies of a folder no longer picked, and adds a newly picked one", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    await pick(aliceId, ["Personal"]);
    await sync(aliceId);
    expect(paths(await listNotes(database.db, aliceId))).toEqual(["Personal/Diary.md"]);
    expect(storage.objects().size).toBe(1);
  });

  it("removes every copy when the account unpicks everything or removes its source", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    await pick(aliceId, []);
    await sync(aliceId);
    expect(await listNotes(database.db, aliceId)).toEqual([]);

    await pick(aliceId, ["Work"]);
    await sync(aliceId);
    expect(storage.objects().size).toBe(2);
    await deleteSource(database.db, aliceId);
    await sync(aliceId);
    expect(await listNotes(database.db, aliceId)).toEqual([]);
    expect(storage.objects().size).toBe(0);
  });

  it("leaves another account's copies untouched", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    await connect(bobId, { "Work/Bob.md": "# Bob" }, ["Work"]);
    await sync(aliceId);
    await sync(bobId);
    await pick(aliceId, []);
    await sync(aliceId);
    expect(paths(await listNotes(database.db, bobId))).toEqual(["Work/Bob.md"]);
    expect(await readCopy(bobId, "Work/Bob.md")).toBe("# Bob");
    expect(storage.objects().size).toBe(1);
  });
});

describe("the background budget", () => {
  it("syncs a 5,000-note vault in 100 steps of at most 50 files", async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 5000; index += 1) files[`Work/Area ${String(index % 40)}/Note ${String(index)}.md`] = `# Note ${String(index)}`;
    const source = await connect(aliceId, files, ["Work"]);
    const report = await sync(aliceId);
    expect(report).toMatchObject({ succeeded: 100, failed: 0, retried: 0 });
    expect((await listNotes(database.db, aliceId)).length).toBe(5000);
    expect(source.calls.readFile).toBe(5000);
    expect(await findLatestRun(database.db, aliceId)).toMatchObject({ status: "succeeded", steps: 100, copied: 5000 });
  }, 120_000);

  it("never handles more files in one step than its limit, and keeps the run open between steps", async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 12; index += 1) files[`Work/N${String(index)}.md`] = `# ${String(index)}`;
    const source = await connect(aliceId, files, ["Work"]);
    const ctx: SyncContext = {
      db: database.db,
      clock,
      storage,
      keySecret: SECRET,
      openSource: () => source,
      continueSync: async () => {},
      limits: { maxFiles: 5 },
    };
    expect(await runSyncStep(ctx, { userId: aliceId, trigger: "webhook" })).toMatchObject({ kind: "continued" });
    expect(source.calls.readFile).toBe(5);
    expect(await runSyncStep(ctx, { userId: aliceId, trigger: "webhook" })).toMatchObject({ kind: "continued" });
    expect(await runSyncStep(ctx, { userId: aliceId, trigger: "webhook" })).toMatchObject({ kind: "finished" });
    expect(source.calls.readFile).toBe(12);
  });

  it("asks for a later run instead of working while another step holds the account", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    await database.db.execute(sql`UPDATE vault.sources SET sync_requested_at = NULL WHERE user_id = ${aliceId}`);
    expect(await acquireSyncLease(database.db, { userId: aliceId, now: clock.now(), until: new Date(clock.now().getTime() + 60_000) })).not.toBeNull();
    const ctx: SyncContext = { db: database.db, clock, storage, keySecret: SECRET, openSource: () => source, continueSync: async () => {} };
    expect(await runSyncStep(ctx, { userId: aliceId, trigger: "webhook" })).toEqual({ kind: "busy" });
    expect(source.calls.getCursor).toBe(0);
    const row = await database.db.execute<{ requested: boolean }>(sql`SELECT sync_requested_at IS NOT NULL AS requested FROM vault.sources WHERE user_id = ${aliceId}`);
    expect(row.rows[0]?.requested).toBe(true);
  });
});

describe("the five-minute check", () => {
  it("brings a pushed change into the copy within ten minutes of fake time, with no webhook", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    const pushedAt = clock.now().getTime();
    source.write("Work/Pushed.md", "# Pushed");
    let seenAfterMs: number | null = null;
    for (let minute = 1; minute <= 10 && seenAfterMs === null; minute += 1) {
      clock.advance(60_000);
      await runDueJobs(jobsContext(), { handlers: handlers(), random: () => 0 });
      if (paths(await listNotes(database.db, aliceId)).includes("Work/Pushed.md")) seenAfterMs = clock.now().getTime() - pushedAt;
    }
    expect(seenAfterMs).not.toBeNull();
    expect(seenAfterMs).toBeLessThanOrEqual(10 * 60_000);
  });

  it("merges a burst of pushes into one pending step", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    for (let push = 0; push < 3; push += 1) await enqueueVaultSync(jobsContext(), { userId: aliceId, trigger: "webhook" });
    expect((await listJobs(database.db)).filter((job) => job.queue === VAULT_SYNC_QUEUE && job.status === "pending")).toHaveLength(1);
  });
});

describe("the source's failures", () => {
  it("retries after the source's wait on a rate limit, then finishes the same run", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    source.fail("readFile", "source.rate_limited", 120);
    const first = await sync(aliceId);
    expect(first).toMatchObject({ retried: 1, failed: 0 });
    expect(await findLatestRun(database.db, aliceId)).toMatchObject({ status: "running" });
    source.fail("readFile", null);
    clock.advance(120_000);
    await runDueJobs(jobsContext(), { handlers: handlers(), queues: [VAULT_SYNC_QUEUE], random: () => 0 });
    expect(await findLatestRun(database.db, aliceId)).toMatchObject({ status: "succeeded", copied: 2 });
  });

  it("marks the source disconnected and keeps the copies when the grant is gone", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    await sync(aliceId);
    source.write("Work/Later.md", "# Later");
    source.fail("getCursor", "source.disconnected");
    await sync(aliceId);
    expect((await findSource(database.db, aliceId))?.status).toBe("disconnected");
    expect(paths(await listNotes(database.db, aliceId))).toEqual(["Work/Clients/Acme.md", "Work/Plan.md"]);
  });

  it("records a failed run with the code when the vault cannot be listed", async () => {
    const source = await connect(aliceId, VAULT, ["Work"]);
    source.fail("listTree", "source.too_large");
    const report = await sync(aliceId);
    expect(report.failed).toBe(1);
    expect(await findLatestRun(database.db, aliceId)).toMatchObject({ status: "failed", errorCode: "source.too_large" });
  });

  it("fails without a store and enqueues nothing from the check", async () => {
    await connect(aliceId, VAULT, ["Work"]);
    const unconfigured = createVaultSyncJobHandlers({ storage: null, openSource: () => null });
    await enqueueVaultSync(jobsContext(), { userId: aliceId, trigger: "webhook" });
    expect(await runDueJobs(jobsContext(), { handlers: unconfigured, queues: [VAULT_SYNC_QUEUE] })).toMatchObject({ failed: 1 });
    clock.advance(5 * 60_000);
    await runDueJobs(jobsContext(), { handlers: unconfigured });
    expect((await listJobs(database.db)).filter((job) => job.queue === VAULT_SYNC_QUEUE && job.status === "pending")).toHaveLength(0);
  });
});

// The index on a test database, after a real sync from a source in memory, run through the jobs as the worker runs
// them: picked notes cut into passages with vectors, a changed note re-indexed, a removed note's passages gone, other
// accounts untouched, a new model re-embeds, a keyword-only index without a model, a failing model retried and shown,
// and a large vault indexed in bounded steps.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { listJobs, runDueJobs } from "@softure-ai/jobs/testing";
import { createEmbedder, type Embedder } from "@softure-ai/llm";
import { embedWords, fakeEmbeddingModel, type FakeEmbeddingModel } from "@softure-ai/llm/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { saveSharedFolders } from "../folders/shared-folders.ts";
import { saveGithubSource } from "../sources/store.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "../sync/sync-jobs.ts";
import { createFakeSource, type FakeSource } from "../testing/fake-source.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { EMBEDDING_DIMENSIONS } from "./embedding-settings.ts";
import { createVaultIndexJobHandlers, VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE } from "./index-jobs.ts";
import { getIndexProgress } from "./index-store.ts";
import type { IndexLimits } from "./index-step.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const T0 = new Date("2026-11-17T12:00:30Z");
const REPOSITORY = { id: 501, fullName: "alice/notes", defaultBranch: "main" };
const FOLDERS = new Set(["Work", "Personal"]);

let database: TestDatabase;
let clock: TestClock;
let storage: MemoryStorage;
let sources: Map<string, FakeSource>;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
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

function embedderFor(model: FakeEmbeddingModel): Embedder {
  return createEmbedder({ model, dimensions: EMBEDDING_DIMENSIONS, maxRetries: 0 });
}

async function connect(userId: string, files: Record<string, string>, picks: string[]): Promise<FakeSource> {
  const stored = await saveGithubSource(database.db, { userId, installationId: 7, repository: REPOSITORY, now: clock.now() });
  const source = createFakeSource(files);
  sources.set(stored.id, source);
  const saved = await saveSharedFolders(database.db, { userId, paths: picks, knownFolders: FOLDERS, now: clock.now() });
  expect(saved.ok).toBe(true);
  return source;
}

async function sync(userId: string) {
  await enqueueVaultSync(jobsContext(), { userId, trigger: "webhook" });
  const handlers = createVaultSyncJobHandlers({ storage: { storage, keySecret: SECRET }, openSource: (source) => sources.get(source.id) ?? null });
  return runDueJobs(jobsContext(), { handlers, queues: [VAULT_SYNC_QUEUE], random: () => 0 });
}

async function index(embedder: Embedder | null, limits: Partial<IndexLimits> = {}) {
  const handlers = createVaultIndexJobHandlers({ storage: { storage, keySecret: SECRET }, embedder, limits });
  return runDueJobs(jobsContext(), { handlers, queues: [VAULT_INDEX_QUEUE], random: () => 0 });
}

async function readPassages(userId: string) {
  const result = await database.db.execute<{ path: string; ordinal: number; heading: string; body: string; search_text: string; has_vector: boolean }>(sql`
    SELECT path, ordinal, heading, body, search_text, embedding IS NOT NULL AS has_vector
    FROM vault.passages WHERE user_id = ${userId} ORDER BY path, ordinal`);
  return result.rows;
}

async function readVector(userId: string, path: string, ordinal: number): Promise<number[]> {
  const result = await database.db.execute<{ embedding: string }>(sql`
    SELECT embedding::text AS embedding FROM vault.passages WHERE user_id = ${userId} AND path = ${path} AND ordinal = ${ordinal}`);
  return JSON.parse(result.rows[0]?.embedding ?? "[]") as number[];
}

describe("indexing synced notes", () => {
  it("cuts every picked note into passages with folded text and a vector, after a sync enqueues it", async () => {
    await connect(aliceId, { "Work/Acme.md": "# Meetings\nWeekly call with the client.\n\n# Budget\nPlan for next year.", "Personal/Diary.md": "Private." }, ["Work"]);
    await sync(aliceId);
    expect((await listJobs(database.db)).filter((job) => job.queue === VAULT_INDEX_QUEUE && job.status === "pending")).toHaveLength(1);

    const model = fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS, modelId: "fake-embed" });
    await index(embedderFor(model));

    expect(await readPassages(aliceId)).toEqual([
      { path: "Work/Acme.md", ordinal: 0, heading: "Meetings", body: "Weekly call with the client.", search_text: "meetings weekly call with the client", has_vector: true },
      { path: "Work/Acme.md", ordinal: 1, heading: "Budget", body: "Plan for next year.", search_text: "meetings budget plan for next year", has_vector: true },
    ]);
    const stored = await readVector(aliceId, "Work/Acme.md", 0);
    const expected = embedWords("Meetings\nWeekly call with the client.", EMBEDDING_DIMENSIONS);
    // pgvector keeps 32-bit floats.
    expect(stored).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.max(...stored.map((value, item) => Math.abs(value - (expected[item] ?? 0))))).toBeLessThan(1e-6);
    expect(await getIndexProgress(database.db, { userId: aliceId, model: "fake-embed" })).toMatchObject({ notes: 1, indexed: 1, passages: 2, failure: null, lastIndexedAt: T0 });
  });

  it("re-indexes a changed note, drops a removed note's passages and leaves another account alone", async () => {
    const alice = await connect(aliceId, { "Work/A.md": "first text", "Work/B.md": "kept text" }, ["Work"]);
    await connect(bobId, { "Work/A.md": "bob text" }, ["Work"]);
    const embedder = embedderFor(fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS }));
    await sync(aliceId);
    await sync(bobId);
    await index(embedder);

    alice.write("Work/A.md", "second text");
    alice.remove("Work/B.md");
    await sync(aliceId);
    await index(embedder);

    expect((await readPassages(aliceId)).map((row) => [row.path, row.body])).toEqual([["Work/A.md", "second text"]]);
    expect((await readPassages(bobId)).map((row) => [row.path, row.body])).toEqual([["Work/A.md", "bob text"]]);
  });

  it("re-embeds every note when the model changes, through the five-minute check", async () => {
    await connect(aliceId, { "Work/A.md": "alpha", "Work/B.md": "beta" }, ["Work"]);
    await sync(aliceId);
    await index(embedderFor(fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS, modelId: "model-one" })));

    const second = fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS, modelId: "model-two" });
    const handlers = createVaultIndexJobHandlers({ storage: { storage, keySecret: SECRET }, embedder: embedderFor(second) });
    clock.advance(5 * 60_000);
    await runDueJobs(jobsContext(), { handlers, queues: [VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE], random: () => 0 });

    expect(second.calls.flat()).toEqual(["A\nalpha", "B\nbeta"]);
    expect(await getIndexProgress(database.db, { userId: aliceId, model: "model-two" })).toMatchObject({ notes: 2, indexed: 2 });
  });

  it("builds a keyword-only index without a model, and fills the vectors once a model is configured", async () => {
    await connect(aliceId, { "Work/A.md": "Treffen mit dem Kunden" }, ["Work"]);
    await sync(aliceId);
    await index(null);
    expect(await readPassages(aliceId)).toMatchObject([{ search_text: "a treffen mit dem kunden", has_vector: false }]);
    expect(await getIndexProgress(database.db, { userId: aliceId, model: "" })).toMatchObject({ notes: 1, indexed: 1 });

    const handlers = createVaultIndexJobHandlers({ storage: { storage, keySecret: SECRET }, embedder: embedderFor(fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS })) });
    clock.advance(5 * 60_000);
    await runDueJobs(jobsContext(), { handlers, queues: [VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE], random: () => 0 });
    expect(await readPassages(aliceId)).toMatchObject([{ has_vector: true }]);
  });

  it("writes nothing when the model fails, shows the failure, and retries until it succeeds", async () => {
    await connect(aliceId, { "Work/A.md": "alpha" }, ["Work"]);
    await sync(aliceId);

    await index(embedderFor(fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS, behaviour: "unavailable" })));

    expect(await readPassages(aliceId)).toEqual([]);
    expect(await getIndexProgress(database.db, { userId: aliceId, model: "fake-embedding-model" })).toMatchObject({
      indexed: 0,
      failure: { errorCode: "llm.unavailable", failedAt: T0 },
    });
    const retry = (await listJobs(database.db)).find((job) => job.queue === VAULT_INDEX_QUEUE && job.status === "pending");
    expect(retry?.runAt).toEqual(new Date(T0.getTime() + 300_000));

    clock.advance(300_000);
    await index(embedderFor(fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS })));
    expect(await getIndexProgress(database.db, { userId: aliceId, model: "fake-embedding-model" })).toMatchObject({ indexed: 1, failure: null });
  });

  it("refuses vectors of another length than the column, as a failure the panel shows", async () => {
    await connect(aliceId, { "Work/A.md": "alpha" }, ["Work"]);
    await sync(aliceId);
    await index(embedderFor(fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS, behaviour: "wrong-dimensions" })));
    expect((await getIndexProgress(database.db, { userId: aliceId, model: "fake-embedding-model" })).failure?.errorCode).toBe("llm.invalid_output");
  });

  it("indexes a large vault in steps of at most the step's notes and one model call each", async () => {
    const files = Object.fromEntries(Array.from({ length: 95 }, (_, item) => [`Work/Note ${String(item).padStart(3, "0")}.md`, `text of note ${String(item)}`]));
    await connect(aliceId, files, ["Work"]);
    await sync(aliceId);
    const model = fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS, maxEmbeddingsPerCall: 100 });

    await index(embedderFor(model), { maxNotes: 20 });

    expect(model.calls.map((call) => call.length)).toEqual([20, 20, 20, 20, 15]);
    expect(await getIndexProgress(database.db, { userId: aliceId, model: "fake-embedding-model" })).toMatchObject({ notes: 95, indexed: 95, passages: 95 });
  });
});

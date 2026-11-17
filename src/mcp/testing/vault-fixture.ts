// Fictional vaults for the MCP tests on a test database: accounts connected to a source in memory, folders picked and
// synced through the jobs as the worker runs them, then indexed for search, with a store in memory. The tools then
// read what a real sync and index left. The embedder is the fake model by default, so hybrid search runs both rankings.
import { createTestAccount } from "@softure-ai/auth/testing";
import { createTestClock, type TestClock } from "@softure-ai/core";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createVaultTestDatabase } from "../../vault/testing/test-database.ts";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { runDueJobs } from "@softure-ai/jobs/testing";
import { createEmbedder, type Embedder } from "@softure-ai/llm";
import { fakeEmbeddingModel } from "@softure-ai/llm/testing";
import config from "../../../softure.config.ts";
import { saveSharedFolders } from "../../vault/folders/shared-folders.ts";
import { EMBEDDING_DIMENSIONS } from "../../vault/index/embedding-settings.ts";
import { runIndexStep } from "../../vault/index/index-step.ts";
import { saveGithubSource } from "../../vault/sources/store.ts";
import { createFakeSource, type FakeSource } from "../../vault/testing/fake-source.ts";
import { createVaultSyncJobHandlers, enqueueVaultSync, VAULT_SYNC_QUEUE } from "../../vault/sync/sync-jobs.ts";
import type { VaultReadContext } from "../vault-tools.ts";

export const KEY_SECRET = "test-key-secret-0123456789abcdef0123";
export const PANEL_URL = "http://localhost:3000/panel";

export interface VaultFixture {
  readonly database: TestDatabase;
  readonly clock: TestClock;
  readonly storage: MemoryStorage;
  /** The context the tools read, with this fixture's store. */
  readonly readContext: VaultReadContext;
  createAccount(email: string): Promise<string>;
  /** Connects a fake vault; with picks, shares them and syncs. Folders are every folder above a file. */
  connect(userId: string, files: Readonly<Record<string, string>>, picks?: readonly string[]): Promise<FakeSource>;
  pick(userId: string, picks: readonly string[]): Promise<void>;
  /** Syncs the account's picks, then indexes its notes until nothing is pending. */
  sync(userId: string): Promise<void>;
  close(): Promise<void>;
}

export interface VaultFixtureOptions {
  /** The model for the index and the queries; default the fake model, null for a keyword-only instance. */
  readonly embedder?: Embedder | null;
}

/** The fake embedding model at the index's dimensions. */
export function createFakeEmbedder(): Embedder {
  return createEmbedder({ model: fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS }), dimensions: EMBEDDING_DIMENSIONS });
}

export async function createVaultFixture(now: Date = new Date("2026-11-17T12:00:30Z"), options: VaultFixtureOptions = {}): Promise<VaultFixture> {
  const embedder = options.embedder === undefined ? createFakeEmbedder() : options.embedder;
  const database = await createVaultTestDatabase(config.modules);
  const clock = createTestClock(now);
  const storage = createMemoryStorage();
  const sources = new Map<string, FakeSource>();
  const folders = new Map<string, Set<string>>();
  const jobsContext = { db: database.db, clock, config };
  const handlers = createVaultSyncJobHandlers({ storage: { storage, keySecret: KEY_SECRET }, openSource: (source) => sources.get(source.id) ?? null });

  const fixture: VaultFixture = {
    database,
    clock,
    storage,
    readContext: { db: database.db, storage: { storage, keySecret: KEY_SECRET }, panelUrl: PANEL_URL, config, clock, embedder },
    async createAccount(email) {
      return (await createTestAccount(database.db, { email, password: "a long test password" })).id;
    },
    async connect(userId, files, picks = []) {
      const repository = { id: sources.size + 501, fullName: `example/vault-${String(sources.size + 1)}`, defaultBranch: "main" };
      const stored = await saveGithubSource(database.db, { userId, installationId: 7, repository, now: clock.now() });
      const source = createFakeSource(files);
      sources.set(stored.id, source);
      folders.set(userId, foldersOf(Object.keys(files)));
      if (picks.length > 0) {
        await fixture.pick(userId, picks);
        await fixture.sync(userId);
      }
      return source;
    },
    async pick(userId, picks) {
      const saved = await saveSharedFolders(database.db, { userId, paths: [...picks], knownFolders: folders.get(userId) ?? new Set(), now: clock.now() });
      if (!saved.ok) throw new Error(`Picking folders in the fixture: ${saved.error}`);
    },
    async sync(userId) {
      await enqueueVaultSync(jobsContext, { userId, trigger: "webhook" });
      const report = await runDueJobs(jobsContext, { handlers, queues: [VAULT_SYNC_QUEUE], random: () => 0 });
      if (report.failed > 0) throw new Error("Syncing in the fixture: a job failed");
      const indexContext = { db: database.db, clock, storage, keySecret: KEY_SECRET, embedder, continueIndex: () => Promise.resolve() };
      for (;;) {
        const step = await runIndexStep(indexContext, { userId });
        if (step.kind === "idle") return;
        if (step.kind === "retry") throw new Error(`Indexing in the fixture failed: ${step.error}`);
      }
    },
    close: () => database.close(),
  };
  return fixture;
}

function foldersOf(paths: readonly string[]): Set<string> {
  const result = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/").slice(0, -1);
    segments.forEach((_, index) => result.add(segments.slice(0, index + 1).join("/")));
  }
  return result;
}

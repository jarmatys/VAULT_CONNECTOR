// The search index's quality and isolation on the mixed-language fixture: by words alone (no model), and hybrid with
// the fake model. The real model's rate (target: 90% in the top five, cross-language questions included) is measured
// with `npm run index:hit-rate` against a configured endpoint, since tests never call a paid or remote model.
import { createTestAccount } from "@softure-ai/auth/testing";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createMemoryStorage, type MemoryStorage } from "@softure-ai/files/testing";
import { createEmbedder } from "@softure-ai/llm";
import { fakeEmbeddingModel } from "@softure-ai/llm/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { loadAndIndexNotes, measureHitRate } from "../testing/hit-rate.ts";
import { SEARCH_FIXTURE_NOTES, SEARCH_FIXTURE_QUERIES } from "../testing/search-fixture.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { EMBEDDING_DIMENSIONS } from "./embedding-settings.ts";
import { fuseRankings, searchPassages } from "./search-passages.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const SAME_LANGUAGE = SEARCH_FIXTURE_QUERIES.filter((query) => query.crossLanguage !== true);

let database: TestDatabase;
let storage: MemoryStorage;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase(config.modules);
  storage = createMemoryStorage();
  aliceId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  bobId = (await createTestAccount(database.db, { email: "bob@example.com", password: "a long test password" })).id;
});

afterEach(async () => {
  await database.close();
});

describe("search quality on the mixed-language fixture", () => {
  it("finds the right note in the top five for nearly every same-language question by words alone", async () => {
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: null };
    await loadAndIndexNotes(ctx, aliceId, SEARCH_FIXTURE_NOTES);

    const result = await measureHitRate(ctx, { userId: aliceId, queries: SAME_LANGUAGE });

    expect(result.misses).toEqual([]);
    expect(result.rate).toBe(1);
  });

  it("keeps the rate with the fake model merged in, and the fused ranking needs both lists to agree for the top", async () => {
    const embedder = createEmbedder({ model: fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS }), dimensions: EMBEDDING_DIMENSIONS });
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder };
    await loadAndIndexNotes(ctx, aliceId, SEARCH_FIXTURE_NOTES);

    expect((await measureHitRate(ctx, { userId: aliceId, queries: SAME_LANGUAGE })).rate).toBeGreaterThanOrEqual(0.9);
    const row = (path: string) => ({ path, ordinal: 0, heading: "", body: "" });
    expect(fuseRankings([[row("a"), row("b")], [row("b"), row("c")]]).map((hit) => hit.path)).toEqual(["b", "a", "c"]);
  });

  it("finds a typo through the trigram fallback", async () => {
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: null };
    await loadAndIndexNotes(ctx, aliceId, SEARCH_FIXTURE_NOTES);
    const hits = await searchPassages(database.db, { userId: aliceId, query: "sourdugh", embedder: null });
    expect(hits[0]?.path).toBe("Personal/Recipes/Bread.md");
  });

  it("never returns another account's passages", async () => {
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: null };
    await loadAndIndexNotes(ctx, bobId, SEARCH_FIXTURE_NOTES);
    await loadAndIndexNotes(ctx, aliceId, [{ path: "Work/Only.md", text: "alice private text" }]);

    expect(await searchPassages(database.db, { userId: aliceId, query: "Northwind retainer", embedder: null })).toEqual([]);
    expect((await searchPassages(database.db, { userId: aliceId, query: "alice private", embedder: null })).map((hit) => hit.path)).toEqual(["Work/Only.md"]);
  });

  it("answers nothing for a query without words and no model", async () => {
    expect(await searchPassages(database.db, { userId: aliceId, query: " ?! ", embedder: null })).toEqual([]);
  });
});

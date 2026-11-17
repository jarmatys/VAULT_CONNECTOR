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
import { fuseRankings, rankPassages, searchPassages } from "./search-passages.ts";

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

describe("folders and modes", () => {
  const fakeEmbedder = () => createEmbedder({ model: fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS }), dimensions: EMBEDDING_DIMENSIONS });

  it("returns only passages below the given folders, at a folder boundary", async () => {
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: null };
    await loadAndIndexNotes(ctx, aliceId, [
      { path: "Work/Plan.md", text: "quarterly plan for the harbour project" },
      { path: "Work2/Plan.md", text: "quarterly plan for the harbour project, the copy" },
      { path: "Personal/Plan.md", text: "quarterly plan for the harbour garden" },
    ]);

    const paths = async (folders?: readonly string[]) =>
      (await searchPassages(database.db, { userId: aliceId, query: "harbour plan", embedder: null, ...(folders === undefined ? {} : { folders }) })).map((hit) => hit.path).sort();

    expect(await paths()).toEqual(["Personal/Plan.md", "Work/Plan.md", "Work2/Plan.md"]);
    expect(await paths(["Work"])).toEqual(["Work/Plan.md"]);
    expect(await paths(["Work", "Personal"])).toEqual(["Personal/Plan.md", "Work/Plan.md"]);
    expect(await paths([])).toEqual([]);
  });

  it("applies the folders before the limit, so a crowded unpicked folder does not hide the picked one's hits", async () => {
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: null };
    const crowd = Array.from({ length: 60 }, (_, index) => ({ path: `Archive/Old ${String(index)}.md`, text: "budget review budget review" }));
    await loadAndIndexNotes(ctx, aliceId, [...crowd, { path: "Work/Budget.md", text: "budget review for next year" }]);

    const hits = await searchPassages(database.db, { userId: aliceId, query: "budget review", embedder: null, folders: ["Work"], limit: 5 });

    expect(hits.map((hit) => hit.path)).toEqual(["Work/Budget.md"]);
  });

  it("keyword mode never calls the model; meaning mode ranks by the model only; hybrid uses both", async () => {
    let calls = 0;
    const base = fakeEmbedder();
    const counting = { ...base, embedTexts: (input: Parameters<typeof base.embedTexts>[0]) => ((calls += 1), base.embedTexts(input)) };
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: base };
    await loadAndIndexNotes(ctx, aliceId, SEARCH_FIXTURE_NOTES);

    const keyword = await rankPassages(database.db, { userId: aliceId, query: "sourdough", embedder: counting, mode: "keyword" });
    expect(calls).toBe(0);
    expect(keyword.usedMeaning).toBe(false);
    expect(keyword.hits[0]?.path).toBe("Personal/Recipes/Bread.md");

    const meaning = await rankPassages(database.db, { userId: aliceId, query: "sourdough", embedder: counting, mode: "meaning", limit: 50 });
    expect(calls).toBe(1);
    expect(meaning.usedMeaning).toBe(true);
    // Every passage with a vector is ranked by distance, so the list is the whole index, not only the word hits.
    expect(meaning.hits.length).toBeGreaterThan(10);

    const hybrid = await rankPassages(database.db, { userId: aliceId, query: "sourdough", embedder: counting, mode: "hybrid" });
    expect(calls).toBe(2);
    expect(hybrid.usedMeaning).toBe(true);
    expect(hybrid.hits[0]?.path).toBe("Personal/Recipes/Bread.md");
  });

  it("meaning mode without a model answers by words and says the model took no part", async () => {
    const ctx = { db: database.db, storage, keySecret: SECRET, embedder: null };
    await loadAndIndexNotes(ctx, aliceId, SEARCH_FIXTURE_NOTES);

    const result = await rankPassages(database.db, { userId: aliceId, query: "sourdough", embedder: null, mode: "meaning" });

    expect(result.usedMeaning).toBe(false);
    expect(result.hits[0]?.path).toBe("Personal/Recipes/Bread.md");
  });
});

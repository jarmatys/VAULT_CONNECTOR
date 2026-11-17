// The search index's hit rate with a real embedding model: `EMBEDDINGS_URL=… [EMBEDDINGS_MODEL=…]
// [EMBEDDINGS_API_KEY=…] npm run index:hit-rate`. Indexes the fictional mixed-language fixture into an in-memory
// database, asks every question (cross-language ones included) and prints the share answered by the right note in the
// top five, per language, and the misses. Exit 1 below the 90% target, 2 without a model. Every run calls the model
// once per passage and once per question: on a paid API, run it only with the owner's yes.
import { auth } from "@softure-ai/auth";
import { createTestAccount } from "@softure-ai/auth/testing";
import { createMemoryStorage } from "@softure-ai/files/testing";
import { createIndexEmbedder, readEmbeddingSettings } from "../src/vault/index/embedding-settings.ts";
import { vault } from "../src/vault/module.ts";
import { loadAndIndexNotes, measureHitRate } from "../src/vault/testing/hit-rate.ts";
import { SEARCH_FIXTURE_NOTES, SEARCH_FIXTURE_QUERIES, type FixtureQuery } from "../src/vault/testing/search-fixture.ts";
import { createVaultTestDatabase } from "../src/vault/testing/test-database.ts";

const TARGET = 0.9;
const KEY_SECRET = "hit-rate-key-secret-0123456789abcdef";

async function main(): Promise<number> {
  const embedder = createIndexEmbedder(readEmbeddingSettings(process.env));
  if (embedder === null) {
    console.error("index-hit-rate: set EMBEDDINGS_URL (and EMBEDDINGS_MODEL, EMBEDDINGS_API_KEY when needed)");
    return 2;
  }
  const database = await createVaultTestDatabase([auth(), vault()]);
  try {
    const userId = (await createTestAccount(database.db, { email: "fixture@example.com", password: "a long fixture password" })).id;
    const ctx = { db: database.db, storage: createMemoryStorage(), keySecret: KEY_SECRET, embedder };
    await loadAndIndexNotes(ctx, userId, SEARCH_FIXTURE_NOTES);
    const groups: [string, readonly FixtureQuery[]][] = [
      ["all", SEARCH_FIXTURE_QUERIES],
      ...(["en", "de", "pl"] as const).map((language): [string, readonly FixtureQuery[]] => [language, SEARCH_FIXTURE_QUERIES.filter((query) => query.language === language)]),
      ["cross-language", SEARCH_FIXTURE_QUERIES.filter((query) => query.crossLanguage === true)],
    ];
    let overall = 0;
    for (const [name, queries] of groups) {
      const result = await measureHitRate(ctx, { userId, queries });
      if (name === "all") overall = result.rate;
      console.log(`${name.padEnd(15)} ${String(result.hits).padStart(3)}/${String(result.total).padEnd(3)} ${(result.rate * 100).toFixed(1)}%`);
      if (name === "all") for (const miss of result.misses) console.log(`  miss: "${miss.query}" expected ${miss.expected}, found ${miss.found.join(", ") || "nothing"}`);
    }
    console.log(`model ${embedder.modelId}; target ${String(TARGET * 100)}% in the top five`);
    return overall >= TARGET ? 0 : 1;
  } finally {
    await database.close();
  }
}

process.exitCode = await main();

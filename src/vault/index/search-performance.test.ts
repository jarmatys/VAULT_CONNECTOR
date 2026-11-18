// NFR-1 on the 5,000-note fixture: a hybrid search (words, trigram fallback and an exact vector scan) over an
// account's passages answers within 3 s at p95. Measured on PGlite in the test process, which is slower than the hosted
// Postgres; the passages carry vectors from the fake model, so the scan reads as many vectors as a real index would.
import { createTestAccount } from "@softure-ai/auth/testing";
import type { TestDatabase } from "@softure-ai/db/testing";
import { createEmbedder } from "@softure-ai/llm";
import { fakeEmbeddingModel } from "@softure-ai/llm/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../../../softure.config.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";
import { EMBEDDING_DIMENSIONS } from "./embedding-settings.ts";
import { foldWords } from "@softure-ai/core";
import { toVectorLiteral } from "./index-store.ts";
import { rankPassages } from "./search-passages.ts";

const NOTES = 5000;
const BATCH = 250;
const WORDS = ["invoice", "client", "retainer", "deadline", "migration", "runbook", "garden", "recipe", "travel", "budget", "meeting", "contract"];
const QUERIES = ["client retainer hours", "migration deadline", "budget meeting notes", "garden recipe", "travel contract", "runbok"];
const P95_LIMIT_MS = 3000;

const embedder = createEmbedder({ model: fakeEmbeddingModel({ dimensions: EMBEDDING_DIMENSIONS }), dimensions: EMBEDDING_DIMENSIONS });
let database: TestDatabase;
let userId: string;

beforeAll(async () => {
  database = await createVaultTestDatabase(config.modules);
  userId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  for (let start = 0; start < NOTES; start += BATCH) {
    const indexes = Array.from({ length: BATCH }, (_, offset) => start + offset);
    const notes = indexes.map((index) => ({ path: `Work/Area ${String(index % 40)}/Note ${String(index)}.md`, body: describeNote(index) }));
    const embedded = await embedder.embedTexts({ values: notes.map((note) => note.body) });
    if (!embedded.ok) throw new Error("Embedding the fixture failed");
    await database.db.execute(sql`
      INSERT INTO vault.notes (user_id, path, version, size, title, changed_at, synced_at)
      VALUES ${sql.join(notes.map((note) => sql`(${userId}, ${note.path}, 'v1', 100, ${note.path}, now(), now())`), sql`, `)}`);
    await database.db.execute(sql`
      INSERT INTO vault.passages (user_id, path, ordinal, heading, body, search_text, embedding)
      VALUES ${sql.join(
        notes.map((note, offset) => sql`(${userId}, ${note.path}, 0, '', ${note.body}, ${foldWords(note.body)}, ${toVectorLiteral(embedded.value.embeddings[offset] ?? [])}::public.vector)`),
        sql`, `,
      )}`);
  }
}, 600_000);

afterAll(async () => {
  await database.close();
});

function describeNote(index: number): string {
  const pick = (offset: number) => WORDS[(index * 7 + offset * 3) % WORDS.length] ?? "note";
  return `Note ${String(index)} about the ${pick(0)} and the ${pick(1)}. Follow up on the ${pick(2)} with the ${pick(3)} next week.`;
}

describe("search speed on 5,000 notes", () => {
  it("answers a hybrid search in under 3 s at p95", async () => {
    const durations: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      for (const query of QUERIES) {
        const started = performance.now();
        const result = await rankPassages(database.db, { userId, query, embedder, mode: "hybrid", folders: ["Work"], limit: 8 });
        durations.push(performance.now() - started);
        expect(result.hits.length).toBe(8);
      }
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
    console.info(`search p95 on ${String(NOTES)} notes: ${p95.toFixed(0)} ms (median ${(durations[Math.floor(durations.length / 2)] ?? 0).toFixed(0)} ms)`);
    expect(p95).toBeLessThan(P95_LIMIT_MS);
  });
});

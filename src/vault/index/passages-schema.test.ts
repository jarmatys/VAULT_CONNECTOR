import { auth } from "@softure-ai/auth";
import { createTestAccount } from "@softure-ai/auth/testing";
import type { TestDatabase } from "@softure-ai/db/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vault } from "../module.ts";
import { createVaultTestDatabase } from "../testing/test-database.ts";

let database: TestDatabase;
let userId: string;

beforeEach(async () => {
  database = await createVaultTestDatabase([auth(), vault()]);
  userId = (await createTestAccount(database.db, { email: "alice@example.com", password: "a long test password" })).id;
  await database.db.execute(sql`
    INSERT INTO vault.notes (user_id, path, version, size, title, changed_at, synced_at)
    VALUES (${userId}, 'Work/Acme.md', 'v1', 10, 'Acme', now(), now())
  `);
});

afterEach(async () => {
  await database.close();
});

function vectorLiteral(first: number): string {
  return `[${[first, 1 - first, ...Array.from({ length: 1022 }, () => 0)].join(",")}]`;
}

async function insertPassage(ordinal: number, searchText: string, first: number) {
  await database.db.execute(sql`
    INSERT INTO vault.passages (user_id, path, ordinal, heading, body, search_text, embedding)
    VALUES (${userId}, 'Work/Acme.md', ${ordinal}, '', ${searchText}, ${searchText}, ${vectorLiteral(first)}::vector)
  `);
}

describe("the passages schema", () => {
  it("finds a passage by keyword prefix, by trigram similarity and by vector distance", async () => {
    await insertPassage(0, "weekly call with the client", 1);
    await insertPassage(1, "budget for next year", 0);

    const byKeyword = await database.db.execute<{ ordinal: number }>(sql`
      SELECT ordinal FROM vault.passages WHERE search_vector @@ to_tsquery('simple', 'clien:*')
    `);
    expect(byKeyword.rows.map((row) => row.ordinal)).toEqual([0]);

    const bySimilarity = await database.db.execute<{ ordinal: number }>(sql`
      SELECT ordinal FROM vault.passages WHERE word_similarity('budgte', search_text) > 0.3
    `);
    expect(bySimilarity.rows.map((row) => row.ordinal)).toEqual([1]);

    const byDistance = await database.db.execute<{ ordinal: number }>(sql`
      SELECT ordinal FROM vault.passages ORDER BY embedding <=> ${vectorLiteral(0.1)}::vector LIMIT 1
    `);
    expect(byDistance.rows.map((row) => row.ordinal)).toEqual([1]);
  });

  it("refuses a vector of another length and drops the passages with their note", async () => {
    await expect(
      database.db.execute(sql`
        INSERT INTO vault.passages (user_id, path, ordinal, heading, body, search_text, embedding)
        VALUES (${userId}, 'Work/Acme.md', 0, '', 'x', 'x', '[1,2,3]'::vector)
      `),
    ).rejects.toThrow();
    await insertPassage(0, "kept until the note goes", 1);

    await database.db.execute(sql`DELETE FROM vault.notes WHERE user_id = ${userId}`);

    const left = await database.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM vault.passages`);
    expect(left.rows[0]?.count).toBe(0);
  });
});

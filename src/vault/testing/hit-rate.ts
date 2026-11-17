// The hit-rate harness of the search index: loads fixture notes straight into an account's copy (rows and stored
// bytes, no source), indexes them with the given embedder until nothing is pending, and asks every query, counting a
// hit when the expected note is among the first `k` notes found. Used by the index tests (fake model) and by
// `npm run index:hit-rate` (a real model from the environment).
import { createTestClock, type Clock } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import type { Embedder } from "@softure-ai/llm";
import { sql } from "drizzle-orm";
import { runIndexStep } from "../index/index-step.ts";
import { searchPassages } from "../index/search-passages.ts";
import { getNoteTitle } from "../index/split-into-passages.ts";
import { createAccountNoteStorage } from "../storage/note-storage.ts";
import type { FixtureNote, FixtureQuery } from "./search-fixture.ts";

export interface HitRateContext {
  readonly db: Queryable;
  readonly storage: FileStorage;
  readonly keySecret: string;
  readonly embedder: Embedder | null;
  readonly clock?: Clock;
}

export interface HitRate {
  readonly total: number;
  readonly hits: number;
  readonly rate: number;
  readonly misses: readonly { readonly query: string; readonly expected: string; readonly found: readonly string[] }[];
}

/** Writes the notes into the account's copy and indexes them until nothing is pending. */
export async function loadAndIndexNotes(ctx: HitRateContext, userId: string, notes: readonly FixtureNote[]): Promise<void> {
  const clock = ctx.clock ?? createTestClock(new Date("2026-11-17T12:00:00Z"));
  const storage = createAccountNoteStorage(ctx.storage, ctx.keySecret, userId);
  for (const note of notes) {
    const bytes = new TextEncoder().encode(note.text);
    await storage.putNote(note.path, bytes);
    await ctx.db.execute(sql`
      INSERT INTO vault.notes (user_id, path, version, size, title, changed_at, synced_at)
      VALUES (${userId}, ${note.path}, ${`v-${String(note.text.length)}`}, ${bytes.length}, ${getNoteTitle(note.path)}, now(), now())`);
  }
  for (;;) {
    const result = await runIndexStep(
      { db: ctx.db, clock, storage: ctx.storage, keySecret: ctx.keySecret, embedder: ctx.embedder, continueIndex: () => Promise.resolve(), limits: { maxNotes: 50 } },
      { userId },
    );
    if (result.kind === "idle") return;
    if (result.kind === "retry") throw new Error(`Indexing the fixture failed: ${result.error}`);
  }
}

/** Asks every query and counts the ones whose expected note is among the first `k` notes found. */
export async function measureHitRate(
  ctx: HitRateContext,
  input: { readonly userId: string; readonly queries: readonly FixtureQuery[]; readonly k?: number },
): Promise<HitRate> {
  const k = input.k ?? 5;
  const misses: { query: string; expected: string; found: string[] }[] = [];
  for (const query of input.queries) {
    const hits = await searchPassages(ctx.db, { userId: input.userId, query: query.query, embedder: ctx.embedder, limit: 50 });
    const found = [...new Set(hits.map((hit) => hit.path))].slice(0, k);
    if (!found.includes(query.expected)) misses.push({ query: query.query, expected: query.expected, found });
  }
  const total = input.queries.length;
  return { total, hits: total - misses.length, rate: total === 0 ? 0 : (total - misses.length) / total, misses };
}

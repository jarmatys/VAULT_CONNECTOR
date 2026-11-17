// The search index's rows: which notes still need passages, the replacement of one note's passages, the account's
// last failure and its progress. A note's passages are replaced in one transaction that locks the note row and checks
// its version, so a step that read an older copy never overwrites newer passages and a note never has a mix.
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";

export interface PendingNote {
  readonly path: string;
  readonly version: string;
  readonly title: string;
}

export interface IndexedPassage {
  readonly ordinal: number;
  readonly heading: string;
  readonly body: string;
  readonly searchText: string;
  /** Null on a keyword-only index. */
  readonly embedding: readonly number[] | null;
}

/**
 * Notes whose passages are missing or out of date: never indexed, indexed from another version, or with another model
 * (`model` is the embedding model's id, '' for a keyword-only index).
 */
export async function listPendingNotes(db: Queryable, input: { readonly userId: string; readonly model: string; readonly limit: number }): Promise<PendingNote[]> {
  const result = await db.execute<{ path: string; version: string; title: string }>(sql`
    SELECT path, version, title FROM vault.notes
    WHERE user_id = ${input.userId}
      AND (indexed_version IS DISTINCT FROM version OR indexed_model IS DISTINCT FROM ${input.model})
    ORDER BY path
    LIMIT ${input.limit}`);
  return result.rows.map((row) => ({ path: row.path, version: row.version, title: row.title }));
}

/** Accounts with a note whose passages are missing or out of date. */
export async function listAccountsToIndex(db: Queryable, model: string): Promise<string[]> {
  const result = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT user_id FROM vault.notes
    WHERE indexed_version IS DISTINCT FROM version OR indexed_model IS DISTINCT FROM ${model}`);
  return result.rows.map((row) => row.user_id);
}

/**
 * Replaces a note's passages and stamps the note with the version and model they come from. Skipped (false) when the
 * note is gone or has changed since it was read: the next step indexes the newer version.
 */
export async function replaceNotePassages(
  db: Queryable,
  input: {
    readonly userId: string;
    readonly path: string;
    readonly version: string;
    readonly model: string;
    readonly passages: readonly IndexedPassage[];
    readonly now: Date;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = await tx.execute<{ version: string }>(sql`
      SELECT version FROM vault.notes WHERE user_id = ${input.userId} AND path = ${input.path} FOR UPDATE`);
    if (current.rows[0]?.version !== input.version) return false;
    await tx.execute(sql`DELETE FROM vault.passages WHERE user_id = ${input.userId} AND path = ${input.path}`);
    if (input.passages.length > 0) {
      const rows = input.passages.map(
        (passage) => sql`(${input.userId}, ${input.path}, ${passage.ordinal}, ${passage.heading}, ${passage.body}, ${passage.searchText},
          ${passage.embedding === null ? null : toVectorLiteral(passage.embedding)}::public.vector)`,
      );
      await tx.execute(sql`
        INSERT INTO vault.passages (user_id, path, ordinal, heading, body, search_text, embedding)
        VALUES ${sql.join(rows, sql`, `)}`);
    }
    await tx.execute(sql`
      UPDATE vault.notes SET indexed_version = ${input.version}, indexed_model = ${input.model}, indexed_at = ${input.now.toISOString()}
      WHERE user_id = ${input.userId} AND path = ${input.path}`);
    return true;
  });
}

/** Records the account's last index failure, shown in the panel until a step succeeds. */
export async function recordIndexFailure(db: Queryable, input: { readonly userId: string; readonly errorCode: string; readonly now: Date }): Promise<void> {
  await db.execute(sql`
    INSERT INTO vault.index_states (user_id, error_code, failed_at) VALUES (${input.userId}, ${input.errorCode}, ${input.now.toISOString()})
    ON CONFLICT (user_id) DO UPDATE SET error_code = EXCLUDED.error_code, failed_at = EXCLUDED.failed_at`);
}

export async function clearIndexFailure(db: Queryable, userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM vault.index_states WHERE user_id = ${userId}`);
}

export interface IndexProgress {
  /** Notes in the synced copy. */
  readonly notes: number;
  /** Notes whose passages match their version and the current model. */
  readonly indexed: number;
  readonly passages: number;
  /** When the last note was indexed; null before the first. */
  readonly lastIndexedAt: Date | null;
  readonly failure: { readonly errorCode: string; readonly failedAt: Date } | null;
}

/** The account's index progress against the current model ('' for keyword-only). */
export async function getIndexProgress(db: Queryable, input: { readonly userId: string; readonly model: string }): Promise<IndexProgress> {
  const counts = await db.execute<{ notes: number; indexed: number; passages: number; last_indexed_at: string | Date | null }>(sql`
    SELECT
      (SELECT count(*)::int FROM vault.notes WHERE user_id = ${input.userId}) AS notes,
      (SELECT count(*)::int FROM vault.notes WHERE user_id = ${input.userId}
         AND indexed_version = version AND indexed_model = ${input.model}) AS indexed,
      (SELECT count(*)::int FROM vault.passages WHERE user_id = ${input.userId}) AS passages,
      (SELECT max(indexed_at) FROM vault.notes WHERE user_id = ${input.userId}) AS last_indexed_at`);
  const failure = await db.execute<{ error_code: string; failed_at: string | Date }>(sql`
    SELECT error_code, failed_at FROM vault.index_states WHERE user_id = ${input.userId}`);
  const row = counts.rows[0];
  const failed = failure.rows[0];
  return {
    notes: row?.notes ?? 0,
    indexed: row?.indexed ?? 0,
    passages: row?.passages ?? 0,
    lastIndexedAt: row?.last_indexed_at == null ? null : new Date(row.last_indexed_at),
    failure: failed === undefined ? null : { errorCode: failed.error_code, failedAt: new Date(failed.failed_at) },
  };
}

/** pgvector's text form of a vector. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

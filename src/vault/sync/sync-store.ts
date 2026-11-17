// The sync's rows in the `vault` schema: the account's sync state on its source row (synced cursor, a pending request,
// the step lease), the runs with their remaining items, and the table of contents (`vault.notes`). Every read and
// write names the account or a run of the account; a step changes one item and its counters in one transaction.
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";
import type { NoteToc } from "../toc/note-toc.ts";
import type { SyncCopy, SyncPlan } from "./sync-plan.ts";

export type SyncTrigger = "webhook" | "schedule" | "picks";
export const SYNC_TRIGGERS: readonly SyncTrigger[] = ["webhook", "schedule", "picks"];

export interface SyncRun {
  readonly id: string;
  readonly status: "running" | "succeeded" | "failed";
  readonly trigger: SyncTrigger;
  readonly targetCursor: string | null;
  readonly plannedCopies: number;
  readonly plannedRemovals: number;
  readonly copied: number;
  readonly removed: number;
  readonly skippedTooLarge: number;
  readonly skippedNotNote: number;
  /** Shared notes over the plan's note or storage cap. */
  readonly skippedOverLimit: number;
  readonly steps: number;
  readonly errorCode: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export type SyncItem =
  | { readonly action: "copy"; readonly path: string; readonly version: string; readonly size: number }
  | { readonly action: "remove"; readonly path: string };

export interface StoredNote {
  readonly path: string;
  readonly version: string;
  readonly size: number;
  readonly title: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly description: string | null;
  readonly changedAt: Date;
  readonly syncedAt: Date;
}

/** Rows written per statement when a run's items are stored. */
const ITEM_CHUNK = 500;

/**
 * Takes the account's step lease until `until`, when no other step holds it. Answers the source's sync state, or null
 * when another step holds the lease or the account has no source.
 */
export async function acquireSyncLease(
  db: Queryable,
  input: { readonly userId: string; readonly now: Date; readonly until: Date },
): Promise<{ readonly syncedCursor: string | null; readonly requestedAt: Date | null } | null> {
  const result = await db.execute<{ synced_cursor: string | null; sync_requested_at: string | Date | null }>(sql`
    UPDATE vault.sources SET sync_lease_until = ${input.until.toISOString()}
    WHERE user_id = ${input.userId} AND (sync_lease_until IS NULL OR sync_lease_until <= ${input.now.toISOString()})
    RETURNING synced_cursor, sync_requested_at`);
  const row = result.rows[0];
  if (row === undefined) return null;
  return { syncedCursor: row.synced_cursor, requestedAt: row.sync_requested_at === null ? null : toDate(row.sync_requested_at) };
}

export async function releaseSyncLease(db: Queryable, userId: string): Promise<void> {
  await db.execute(sql`UPDATE vault.sources SET sync_lease_until = NULL WHERE user_id = ${userId}`);
}

/**
 * Asks for a sync of the account (kept until a run plans): the five-minute check and the end of a running run pick it
 * up. `resetCursor` makes the next run compare everything, for a change of picks.
 */
export async function requestSync(db: Queryable, input: { readonly userId: string; readonly now: Date; readonly resetCursor?: boolean }): Promise<void> {
  const reset = input.resetCursor === true ? sql`, synced_cursor = NULL` : sql``;
  await db.execute(sql`
    UPDATE vault.sources SET sync_requested_at = COALESCE(sync_requested_at, ${input.now.toISOString()})${reset}
    WHERE user_id = ${input.userId}`);
}

/** Clears a pending request: the run being planned covers it. */
export async function clearSyncRequest(db: Queryable, userId: string): Promise<void> {
  await db.execute(sql`UPDATE vault.sources SET sync_requested_at = NULL WHERE user_id = ${userId}`);
}

/** Records that the copy matches `cursor`, unless a sync was asked for since (a change of picks keeps it null). */
export async function recordSyncedCursor(db: Queryable, input: { readonly userId: string; readonly cursor: string }): Promise<void> {
  await db.execute(sql`
    UPDATE vault.sources SET synced_cursor = ${input.cursor}
    WHERE user_id = ${input.userId} AND sync_requested_at IS NULL`);
}

/** Whether a sync was asked for and not yet planned. */
export async function hasSyncRequest(db: Queryable, userId: string): Promise<boolean> {
  const result = await db.execute<{ requested: boolean }>(sql`
    SELECT sync_requested_at IS NOT NULL AS requested FROM vault.sources WHERE user_id = ${userId}`);
  return result.rows[0]?.requested === true;
}

/** The account's copies, path to version. */
export async function listCopyVersions(db: Queryable, userId: string): Promise<Map<string, string>> {
  const result = await db.execute<{ path: string; version: string }>(sql`SELECT path, version FROM vault.notes WHERE user_id = ${userId}`);
  return new Map(result.rows.map((row) => [row.path, row.version]));
}

/** The account's table of contents, sorted by path. */
export async function listNotes(db: Queryable, userId: string): Promise<StoredNote[]> {
  const result = await db.execute<NoteRow>(sql`
    SELECT path, version, size, title, tags, aliases, description, changed_at, synced_at
    FROM vault.notes WHERE user_id = ${userId} ORDER BY path COLLATE "C"`);
  return result.rows.map(toNote);
}

/** The account's open run, or null. */
export async function findOpenRun(db: Queryable, userId: string): Promise<SyncRun | null> {
  const result = await db.execute<RunRow>(sql`SELECT ${RUN_COLUMNS} FROM vault.sync_runs WHERE user_id = ${userId} AND status = 'running'`);
  const row = result.rows[0];
  return row === undefined ? null : toRun(row);
}

/** The account's latest run, open or finished, or null. */
export async function findLatestRun(db: Queryable, userId: string): Promise<SyncRun | null> {
  const result = await db.execute<RunRow>(sql`
    SELECT ${RUN_COLUMNS} FROM vault.sync_runs WHERE user_id = ${userId} ORDER BY started_at DESC, id LIMIT 1`);
  const row = result.rows[0];
  return row === undefined ? null : toRun(row);
}

/** Opens a run with its plan as items, in one transaction. */
export async function createRun(
  db: Queryable,
  input: { readonly userId: string; readonly trigger: SyncTrigger; readonly targetCursor: string | null; readonly plan: SyncPlan; readonly now: Date },
): Promise<SyncRun> {
  return db.transaction(async (tx) => {
    const result = await tx.execute<RunRow>(sql`
      INSERT INTO vault.sync_runs (user_id, status, trigger, target_cursor, planned_copies, planned_removals,
        skipped_too_large, skipped_not_note, skipped_over_limit, started_at)
      VALUES (${input.userId}, 'running', ${input.trigger}, ${input.targetCursor}, ${input.plan.copies.length},
        ${input.plan.removals.length}, ${input.plan.skippedTooLarge}, ${input.plan.skippedNotNote}, ${input.plan.skippedOverLimit},
        ${input.now.toISOString()})
      RETURNING ${RUN_COLUMNS}`);
    const row = result.rows[0];
    if (row === undefined) throw new Error("Opening a sync run returned no row");
    const items: SyncItem[] = [
      ...input.plan.copies.map((copy: SyncCopy): SyncItem => ({ action: "copy", ...copy })),
      ...input.plan.removals.map((path): SyncItem => ({ action: "remove", path })),
    ];
    for (let start = 0; start < items.length; start += ITEM_CHUNK) {
      const chunk = items.slice(start, start + ITEM_CHUNK);
      const values = chunk.map((item) =>
        item.action === "copy"
          ? sql`(${row.id}, ${item.path}, 'copy', ${item.version}, ${item.size})`
          : sql`(${row.id}, ${item.path}, 'remove', NULL, NULL)`,
      );
      await tx.execute(sql`INSERT INTO vault.sync_items (run_id, path, action, version, size) VALUES ${sql.join(values, sql`, `)}`);
    }
    return toRun(row);
  });
}

/** Up to `limit` items of the run, removals first, then by path. */
export async function takeItems(db: Queryable, input: { readonly runId: string; readonly limit: number }): Promise<SyncItem[]> {
  const result = await db.execute<{ path: string; action: string; version: string | null; size: number | null }>(sql`
    SELECT path, action, version, size FROM vault.sync_items WHERE run_id = ${input.runId}
    ORDER BY action DESC, path COLLATE "C" LIMIT ${input.limit}`);
  return result.rows.map((row) =>
    row.action === "copy" ? { action: "copy", path: row.path, version: row.version ?? "", size: Number(row.size ?? 0) } : { action: "remove", path: row.path },
  );
}

/** Whether the run still has items. */
export async function hasItems(db: Queryable, runId: string): Promise<boolean> {
  const result = await db.execute<{ has: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM vault.sync_items WHERE run_id = ${runId}) AS has`);
  return result.rows[0]?.has === true;
}

/** A note copied: its table of contents row written (its last change moves only with a new version), its item done. */
export async function recordCopied(
  db: Queryable,
  input: { readonly userId: string; readonly runId: string; readonly copy: SyncCopy; readonly toc: NoteToc; readonly now: Date },
): Promise<void> {
  const now = input.now.toISOString();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO vault.notes (user_id, path, version, size, title, tags, aliases, description, changed_at, synced_at)
      VALUES (${input.userId}, ${input.copy.path}, ${input.copy.version}, ${input.copy.size}, ${input.toc.title},
        ${toTextArray(input.toc.tags)}, ${toTextArray(input.toc.aliases)}, ${input.toc.description}, ${now}, ${now})
      ON CONFLICT (user_id, path) DO UPDATE SET version = EXCLUDED.version, size = EXCLUDED.size, title = EXCLUDED.title,
        tags = EXCLUDED.tags, aliases = EXCLUDED.aliases, description = EXCLUDED.description, synced_at = EXCLUDED.synced_at,
        changed_at = CASE WHEN vault.notes.version = EXCLUDED.version THEN vault.notes.changed_at ELSE EXCLUDED.changed_at END`);
    await completeItem(tx, input.runId, input.copy.path, sql`copied = copied + 1`);
  });
}

/** A copy removed: its row gone, its item done. */
export async function recordRemoved(db: Queryable, input: { readonly userId: string; readonly runId: string; readonly path: string }): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM vault.notes WHERE user_id = ${input.userId} AND path = ${input.path}`);
    await completeItem(tx, input.runId, input.path, sql`removed = removed + 1`);
  });
}

/**
 * An item dropped without a copy: the file was gone at the source by the time it was read, or turned out over the size
 * limit (counted).
 */
export async function dropItem(db: Queryable, input: { readonly runId: string; readonly path: string; readonly reason: "gone" | "too_large" }): Promise<void> {
  await db.transaction(async (tx) => {
    await completeItem(tx, input.runId, input.path, input.reason === "too_large" ? sql`skipped_too_large = skipped_too_large + 1` : null);
  });
}

/** Counts one step of the run. */
export async function countStep(db: Queryable, runId: string): Promise<void> {
  await db.execute(sql`UPDATE vault.sync_runs SET steps = steps + 1 WHERE id = ${runId}`);
}

/** Ends the run: succeeded, or failed with a code (its remaining items go). */
export async function finishRun(
  db: Queryable,
  input: { readonly runId: string; readonly now: Date; readonly outcome: { readonly kind: "succeeded" } | { readonly kind: "failed"; readonly errorCode: string } },
): Promise<void> {
  const now = input.now.toISOString();
  await db.transaction(async (tx) => {
    if (input.outcome.kind === "succeeded") {
      await tx.execute(sql`UPDATE vault.sync_runs SET status = 'succeeded', finished_at = ${now} WHERE id = ${input.runId} AND status = 'running'`);
      return;
    }
    await tx.execute(sql`DELETE FROM vault.sync_items WHERE run_id = ${input.runId}`);
    await tx.execute(sql`
      UPDATE vault.sync_runs SET status = 'failed', error_code = ${input.outcome.errorCode}, finished_at = ${now}
      WHERE id = ${input.runId} AND status = 'running'`);
  });
}

/**
 * Records a run that failed before it could plan (the source refused the listing, no reader for it), so the panel and the
 * operator's alert see it. A failure with the same code as the latest run is not written again.
 */
export async function recordFailedPlan(
  db: Queryable,
  input: { readonly userId: string; readonly trigger: SyncTrigger; readonly errorCode: string; readonly now: Date },
): Promise<void> {
  const latest = await findLatestRun(db, input.userId);
  if (latest?.status === "failed" && latest.errorCode === input.errorCode && latest.plannedCopies + latest.plannedRemovals === 0) return;
  const now = input.now.toISOString();
  await db.execute(sql`
    INSERT INTO vault.sync_runs (user_id, status, trigger, error_code, started_at, finished_at)
    VALUES (${input.userId}, 'failed', ${input.trigger}, ${input.errorCode}, ${now}, ${now})`);
}

/**
 * The accounts the scheduled check looks at: a connected source with picks or copies, copies left without a source, or
 * a sync asked for. Sorted, so a check that stops early resumes in order.
 */
export async function listAccountsToCheck(db: Queryable): Promise<string[]> {
  const result = await db.execute<{ user_id: string }>(sql`
    SELECT s.user_id FROM vault.sources s
    WHERE s.status = 'connected'
      AND (s.sync_requested_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM vault.shared_folders f WHERE f.user_id = s.user_id)
        OR EXISTS (SELECT 1 FROM vault.notes n WHERE n.user_id = s.user_id))
    UNION
    SELECT DISTINCT n.user_id FROM vault.notes n
    WHERE NOT EXISTS (SELECT 1 FROM vault.sources s WHERE s.user_id = n.user_id)
    ORDER BY 1`);
  return result.rows.map((row) => row.user_id);
}

async function completeItem(tx: Queryable, runId: string, path: string, counter: ReturnType<typeof sql> | null): Promise<void> {
  const deleted = await tx.execute<{ path: string }>(sql`DELETE FROM vault.sync_items WHERE run_id = ${runId} AND path = ${path} RETURNING path`);
  // A repeated step (at-least-once) finds the item already done: count it once.
  if (deleted.rows.length > 0 && counter !== null) await tx.execute(sql`UPDATE vault.sync_runs SET ${counter} WHERE id = ${runId}`);
}

/** A Postgres text array literal parameter, the same on node-postgres and PGlite. */
function toTextArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

interface RunRow extends Record<string, unknown> {
  readonly id: string;
  readonly status: string;
  readonly trigger: string;
  readonly target_cursor: string | null;
  readonly planned_copies: number;
  readonly planned_removals: number;
  readonly copied: number;
  readonly removed: number;
  readonly skipped_too_large: number;
  readonly skipped_not_note: number;
  readonly skipped_over_limit: number;
  readonly steps: number;
  readonly error_code: string | null;
  readonly started_at: string | Date;
  readonly finished_at: string | Date | null;
}

const RUN_COLUMNS = sql`id, status, trigger, target_cursor, planned_copies, planned_removals, copied, removed, skipped_too_large,
  skipped_not_note, skipped_over_limit, steps, error_code, started_at, finished_at`;

function toRun(row: RunRow): SyncRun {
  if (row.status !== "running" && row.status !== "succeeded" && row.status !== "failed") throw new Error(`Reading a sync run: unknown status ${row.status}`);
  if (!SYNC_TRIGGERS.includes(row.trigger as SyncTrigger)) throw new Error(`Reading a sync run: unknown trigger ${row.trigger}`);
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger as SyncTrigger,
    targetCursor: row.target_cursor,
    plannedCopies: Number(row.planned_copies),
    plannedRemovals: Number(row.planned_removals),
    copied: Number(row.copied),
    removed: Number(row.removed),
    skippedTooLarge: Number(row.skipped_too_large),
    skippedNotNote: Number(row.skipped_not_note),
    skippedOverLimit: Number(row.skipped_over_limit),
    steps: Number(row.steps),
    errorCode: row.error_code,
    startedAt: toDate(row.started_at),
    finishedAt: row.finished_at === null ? null : toDate(row.finished_at),
  };
}

interface NoteRow extends Record<string, unknown> {
  readonly path: string;
  readonly version: string;
  readonly size: number;
  readonly title: string;
  readonly tags: readonly string[] | string;
  readonly aliases: readonly string[] | string;
  readonly description: string | null;
  readonly changed_at: string | Date;
  readonly synced_at: string | Date;
}

function toNote(row: NoteRow): StoredNote {
  return {
    path: row.path,
    version: row.version,
    size: Number(row.size),
    title: row.title,
    tags: toArray(row.tags),
    aliases: toArray(row.aliases),
    description: row.description,
    changedAt: toDate(row.changed_at),
    syncedAt: toDate(row.synced_at),
  };
}

/** A text array as the driver hands it back (an array, or the literal when a driver does not parse it). */
function toArray(value: readonly string[] | string): string[] {
  if (Array.isArray(value)) return [...(value as readonly string[])];
  const inner = String(value).replace(/^\{|\}$/g, "");
  if (inner === "") return [];
  return (inner.match(/"((?:[^"\\]|\\.)*)"|[^,]+/g) ?? []).map((item) => (item.startsWith('"') ? item.slice(1, -1).replace(/\\(.)/g, "$1") : item));
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

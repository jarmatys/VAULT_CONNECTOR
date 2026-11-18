// The vault's part of an account's export and deletion (FR-20), run by `@softure-ai/privacy` inside its transaction.
// The export lists what the service keeps about the account's vault: the source without its secrets, the picked
// folders, the copied notes by path (never their text, title or tags: the account has the notes themselves), the sync
// runs and the last index failure. The deletion removes every vault row of the account and queues the object key of
// each copy it had; `vault.erase-copies` deletes the objects after the commit, so a refused deletion leaves the copies
// in place with their rows.
import { ok, type ModuleContext, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { enqueueJob } from "@softure-ai/jobs/server";
import { sql } from "drizzle-orm";
import { readVaultStorageSettings } from "../storage/storage-settings.ts";
import { deriveAccountPrefix, getNoteKey } from "../storage/note-storage.ts";
import { ERASE_DELAY_SECONDS, VAULT_ERASE_QUEUE } from "./erase-queues.ts";

/** Keys written per statement when the copies are queued. */
const KEY_CHUNK = 500;

export interface VaultUserData {
  readonly source: ExportedSource | null;
  readonly sharedFolders: readonly { readonly path: string; readonly pickedAt: string }[];
  readonly copiedNotes: readonly ExportedNote[];
  readonly syncRuns: readonly ExportedSyncRun[];
  readonly lastIndexFailure: { readonly errorCode: string; readonly failedAt: string } | null;
}

export type ExportedSource =
  | (ExportedSourceBase & { readonly kind: "github"; readonly repository: string; readonly branch: string })
  | (ExportedSourceBase & { readonly kind: "s3"; readonly endpoint: string; readonly region: string; readonly bucket: string; readonly prefix: string })
  | (ExportedSourceBase & { readonly kind: "dropbox"; readonly folder: string })
  | (ExportedSourceBase & { readonly kind: "headless-sync"; readonly vaultName: string; readonly encryption: string });

interface ExportedSourceBase {
  readonly status: string;
  readonly connectedAt: string;
  readonly checkedAt: string;
  readonly disconnectedAt: string | null;
}

export interface ExportedNote {
  readonly path: string;
  readonly size: number;
  readonly syncedAt: string;
  readonly indexedAt: string | null;
}

export interface ExportedSyncRun {
  readonly status: string;
  readonly trigger: string;
  readonly copied: number;
  readonly removed: number;
  readonly errorCode: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

type Timestamp = string | Date;

/** Where the copies are, as far as the deletion needs it: the key secret, or null when no store is configured. */
export type ReadKeySecret = () => string | null;

/** The key secret of the configured store; null without one (no copy can exist then). */
export function readConfiguredKeySecret(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const settings = readVaultStorageSettings(env);
  return settings.kind === "configured" ? settings.keySecret : null;
}

export async function exportVaultUserData(context: ModuleContext, userId: string): Promise<Result<VaultUserData>> {
  const db = context.db as Queryable;
  const [source, folders, notes, runs, indexState] = await Promise.all([
    db.execute<SourceRow>(sql`
      SELECT kind, status, repository_full_name, default_branch, s3_endpoint, s3_region, s3_bucket, s3_prefix, dropbox_folder,
        headless_vault_name, headless_encryption, connected_at, checked_at, disconnected_at
      FROM vault.sources WHERE user_id = ${userId}`),
    db.execute<{ path: string; picked_at: Timestamp }>(sql`
      SELECT path, picked_at FROM vault.shared_folders WHERE user_id = ${userId} ORDER BY path`),
    db.execute<{ path: string; size: number; synced_at: Timestamp; indexed_at: Timestamp | null }>(sql`
      SELECT path, size, synced_at, indexed_at FROM vault.notes WHERE user_id = ${userId} ORDER BY path`),
    db.execute<SyncRunRow>(sql`
      SELECT status, trigger, copied, removed, error_code, started_at, finished_at
      FROM vault.sync_runs WHERE user_id = ${userId} ORDER BY started_at`),
    db.execute<{ error_code: string; failed_at: Timestamp }>(sql`
      SELECT error_code, failed_at FROM vault.index_states WHERE user_id = ${userId}`),
  ]);
  const failure = indexState.rows[0];
  return ok({
    source: source.rows[0] === undefined ? null : toExportedSource(source.rows[0]),
    sharedFolders: folders.rows.map((row) => ({ path: row.path, pickedAt: toIso(row.picked_at) })),
    copiedNotes: notes.rows.map((row) => ({
      path: row.path,
      size: Number(row.size),
      syncedAt: toIso(row.synced_at),
      indexedAt: row.indexed_at === null ? null : toIso(row.indexed_at),
    })),
    syncRuns: runs.rows.map((row) => ({
      status: row.status,
      trigger: row.trigger,
      copied: Number(row.copied),
      removed: Number(row.removed),
      errorCode: row.error_code,
      startedAt: toIso(row.started_at),
      finishedAt: row.finished_at === null ? null : toIso(row.finished_at),
    })),
    lastIndexFailure: failure === undefined ? null : { errorCode: failure.error_code, failedAt: toIso(failure.failed_at) },
  });
}

/**
 * Deletes the account's vault rows and queues its copies for `vault.erase-copies`. The copies are the notes it has and
 * the items its runs planned (a step in flight copies only planned items, and the job is due after its lease).
 */
export async function deleteVaultUserData(context: ModuleContext, userId: string, readKeySecret: ReadKeySecret = readConfiguredKeySecret): Promise<Result<undefined>> {
  const db = context.db as Queryable;
  await removeAccountCopies(context, userId, readKeySecret);
  await db.execute(sql`DELETE FROM vault.sync_runs WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM vault.shared_folders WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM vault.source_link_states WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM vault.sources WHERE user_id = ${userId}`);
  return ok();
}

/**
 * Removes the account's copies and their index, and queues the copied objects for `vault.erase-copies`: an account's
 * deletion, and the end of a lapsed account's grace period (VC-15), which keeps the source, the picks and the run
 * history. Answers how many object keys it queued.
 */
export async function removeAccountCopies(context: ModuleContext, userId: string, readKeySecret: ReadKeySecret = readConfiguredKeySecret): Promise<number> {
  const db = context.db as Queryable;
  const keySecret = readKeySecret();
  let queued = 0;
  if (keySecret !== null) {
    const paths = await db.execute<{ path: string }>(sql`
      SELECT path FROM vault.notes WHERE user_id = ${userId}
      UNION
      SELECT i.path FROM vault.sync_items i JOIN vault.sync_runs r ON r.id = i.run_id WHERE r.user_id = ${userId}`);
    const prefix = deriveAccountPrefix(keySecret, userId);
    const keys = paths.rows.map((row) => getNoteKey(prefix, row.path));
    await queueObjectErasures(db, { keys, now: context.clock.now() });
    if (keys.length > 0) {
      await enqueueJob({ db, clock: context.clock, config: context.config }, { queue: VAULT_ERASE_QUEUE, payload: {}, delaySeconds: ERASE_DELAY_SECONDS, origin: "vault.account-copies-removed" });
    }
    queued = keys.length;
  }
  // Children first, so the order does not lean on the foreign keys' ON DELETE.
  await db.execute(sql`DELETE FROM vault.passages WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM vault.notes WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM vault.sync_items WHERE run_id IN (SELECT id FROM vault.sync_runs WHERE user_id = ${userId})`);
  await db.execute(sql`DELETE FROM vault.index_states WHERE user_id = ${userId}`);
  return queued;
}

/** Adds object keys to the erasure queue; a key already queued stays as it is. */
export async function queueObjectErasures(db: Queryable, input: { readonly keys: readonly string[]; readonly now: Date }): Promise<void> {
  for (let start = 0; start < input.keys.length; start += KEY_CHUNK) {
    const chunk = input.keys.slice(start, start + KEY_CHUNK);
    await db.execute(sql`
      INSERT INTO vault.object_erasures (object_key, queued_at)
      VALUES ${sql.join(chunk.map((key) => sql`(${key}, ${input.now.toISOString()})`), sql`, `)}
      ON CONFLICT (object_key) DO NOTHING`);
  }
}

type SourceRow = {
  readonly kind: "github" | "s3" | "dropbox" | "headless-sync";
  readonly status: string;
  readonly repository_full_name: string | null;
  readonly default_branch: string | null;
  readonly s3_endpoint: string | null;
  readonly s3_region: string | null;
  readonly s3_bucket: string | null;
  readonly s3_prefix: string | null;
  readonly dropbox_folder: string | null;
  readonly headless_vault_name: string | null;
  readonly headless_encryption: string | null;
  readonly connected_at: Timestamp;
  readonly checked_at: Timestamp;
  readonly disconnected_at: Timestamp | null;
};

type SyncRunRow = {
  readonly status: string;
  readonly trigger: string;
  readonly copied: number;
  readonly removed: number;
  readonly error_code: string | null;
  readonly started_at: Timestamp;
  readonly finished_at: Timestamp | null;
};

function toExportedSource(row: SourceRow): ExportedSource {
  const base: ExportedSourceBase = {
    status: row.status,
    connectedAt: toIso(row.connected_at),
    checkedAt: toIso(row.checked_at),
    disconnectedAt: row.disconnected_at === null ? null : toIso(row.disconnected_at),
  };
  // The key pair, the Dropbox refresh token and the sync session with its vault key (all sealed), the Dropbox account
  // id, the sync vault's id, host and salt, and the GitHub installation's ids are left out: secrets and internal ids,
  // not the account's data.
  if (row.kind === "s3") {
    return { ...base, kind: "s3", endpoint: row.s3_endpoint ?? "", region: row.s3_region ?? "", bucket: row.s3_bucket ?? "", prefix: row.s3_prefix ?? "" };
  }
  if (row.kind === "dropbox") return { ...base, kind: "dropbox", folder: row.dropbox_folder ?? "" };
  if (row.kind === "headless-sync") return { ...base, kind: "headless-sync", vaultName: row.headless_vault_name ?? "", encryption: row.headless_encryption ?? "" };
  return { ...base, kind: "github", repository: row.repository_full_name ?? "", branch: row.default_branch ?? "" };
}

function toIso(value: Timestamp): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

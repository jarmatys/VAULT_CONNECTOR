// The folders an account shares. Nothing is shared before the account picks: no row, no note. A picked folder shares
// every note below it, so the stored set is minimal (no folder under another picked folder). Every read and write
// names the account; the rows hang off the account's source and go with it.
import { err, ok, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";
import { isNotePath } from "./folder-tree.ts";

export interface SharedFolder {
  readonly path: string;
  readonly pickedAt: Date;
}

export type SharedFolderErrorCode =
  /** A posted path is not a folder of the vault as the source lists it now. */
  | "vault.folder_unknown"
  /** The account has no source to pick from. */
  | "vault.folder_no_source";

/**
 * The minimal set of a pick: duplicates and folders under another picked folder dropped, sorted. A folder under a
 * picked folder is already shared.
 */
export function normalizeFolderPicks(paths: Iterable<string>): string[] {
  const unique = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  return unique.filter((path) => !unique.some((other) => other !== path && isUnderFolder(path, other)));
}

/** Whether a note path is shared by these picked folders: it is a note, inside one of them. */
export function isPathShared(path: string, folders: Iterable<string>): boolean {
  if (!isNotePath(path)) return false;
  for (const folder of folders) if (isUnderFolder(path, folder)) return true;
  return false;
}

/** Whether `path` lies below `folder` (a folder boundary, not a shared prefix: `Work2` is not under `Work`). */
export function isUnderFolder(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

interface SharedFolderRow extends Record<string, unknown> {
  readonly path: string;
  readonly picked_at: string | Date;
}

/** The account's picked folders, sorted by path; empty when it picked none. */
export async function listSharedFolders(db: Queryable, userId: string): Promise<SharedFolder[]> {
  const result = await db.execute<SharedFolderRow>(sql`
    SELECT path, picked_at FROM vault.shared_folders WHERE user_id = ${userId} ORDER BY path`);
  return result.rows.map((row) => ({ path: row.path, pickedAt: row.picked_at instanceof Date ? row.picked_at : new Date(row.picked_at) }));
}

/**
 * Replaces the account's picks with `paths`, each of which must be a folder of `knownFolders` (the vault's tree now).
 * A folder kept keeps its first pick time. Answers the saved, minimal set; nothing changes on an error.
 */
export async function saveSharedFolders(
  db: Queryable,
  input: { readonly userId: string; readonly paths: Iterable<string>; readonly knownFolders: ReadonlySet<string>; readonly now: Date },
): Promise<Result<string[], SharedFolderErrorCode>> {
  const posted = [...input.paths];
  if (posted.some((path) => !input.knownFolders.has(path))) return err("vault.folder_unknown");
  const picks = normalizeFolderPicks(posted);
  const now = input.now.toISOString();
  return db.transaction(async (tx) => {
    const source = await tx.execute<{ id: string }>(sql`SELECT id FROM vault.sources WHERE user_id = ${input.userId} FOR UPDATE`);
    const sourceId = source.rows[0]?.id;
    if (sourceId === undefined) return err("vault.folder_no_source");
    const kept = picks.length === 0 ? sql`` : sql` AND path NOT IN (${sql.join(picks.map((path) => sql`${path}`), sql`, `)})`;
    await tx.execute(sql`DELETE FROM vault.shared_folders WHERE user_id = ${input.userId}${kept}`);
    for (const path of picks) {
      await tx.execute(sql`
        INSERT INTO vault.shared_folders (user_id, source_id, path, picked_at) VALUES (${input.userId}, ${sourceId}, ${path}, ${now})
        ON CONFLICT (user_id, path) DO NOTHING`);
    }
    return ok(picks);
  });
}

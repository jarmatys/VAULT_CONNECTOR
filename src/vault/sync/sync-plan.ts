// What a sync run has to do, from the source's listing, the account's picks and the copies it already has: copy every
// shared note whose version differs from its copy (new or changed), remove every copy that is no longer a shared note
// (removed at the source, renamed, in a folder no longer picked, grown over the size limit), and count what it skips.
import { isNotePath } from "../folders/folder-tree.ts";
import { isUnderFolder } from "../folders/shared-folders.ts";
import type { SourceFile } from "../sources/source.ts";

/** The largest note copied (1 MiB); a larger one is skipped and counted, never an error (FR-7). */
export const MAX_NOTE_BYTES = 1024 * 1024;

export interface SyncCopy {
  readonly path: string;
  readonly version: string;
  readonly size: number;
}

export interface SyncPlan {
  readonly copies: readonly SyncCopy[];
  readonly removals: readonly string[];
  /** Notes in picked folders over the size limit. */
  readonly skippedTooLarge: number;
  /** Files in picked folders that are not notes (attachments, drawings, other formats), outside dot folders. */
  readonly skippedNotNote: number;
}

export interface PlanSyncInput {
  readonly files: readonly SourceFile[];
  readonly picks: readonly string[];
  /** The account's copies: path to version. */
  readonly copies: ReadonlyMap<string, string>;
  readonly maxNoteBytes?: number;
}

export function planSync(input: PlanSyncInput): SyncPlan {
  const maxNoteBytes = input.maxNoteBytes ?? MAX_NOTE_BYTES;
  const shared = new Map<string, SourceFile>();
  let skippedTooLarge = 0;
  let skippedNotNote = 0;
  for (const file of input.files) {
    if (!input.picks.some((folder) => isUnderFolder(file.path, folder))) continue;
    if (!isNotePath(file.path)) {
      if (!isHidden(file.path)) skippedNotNote += 1;
      continue;
    }
    if (file.size > maxNoteBytes) {
      skippedTooLarge += 1;
      continue;
    }
    shared.set(file.path, file);
  }
  const copies = [...shared.values()]
    .filter((file) => input.copies.get(file.path) !== file.version)
    .map((file) => ({ path: file.path, version: file.version, size: file.size }))
    .sort((left, right) => compare(left.path, right.path));
  const removals = [...input.copies.keys()].filter((path) => !shared.has(path)).sort(compare);
  return { copies, removals, skippedTooLarge, skippedNotNote };
}

/** Whether nothing has to change. */
export function isEmptyPlan(plan: SyncPlan): boolean {
  return plan.copies.length === 0 && plan.removals.length === 0;
}

function isHidden(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

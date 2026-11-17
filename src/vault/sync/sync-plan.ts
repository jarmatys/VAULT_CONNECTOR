// What a sync run has to do, from the source's listing, the account's picks and the copies it already has: copy every
// shared note whose version differs from its copy (new or changed), remove every copy that is no longer a shared note
// (removed at the source, renamed, in a folder no longer picked, grown over the size limit, over the plan's caps), and
// count what it skips. The plan's caps (FR-18) keep the notes the account already has a copy of first, so a new note
// never pushes out an old one, then the rest; each group by path. A note fits while the count stays within the note cap
// and the summed size within the storage cap; the notes that do not fit are neither copied nor indexed.
import type { NoteCaps } from "../limits/account-limits.ts";
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
  /** Notes in picked folders over the plan's note or storage cap. */
  readonly skippedOverLimit: number;
}

export interface PlanSyncInput {
  readonly files: readonly SourceFile[];
  readonly picks: readonly string[];
  /** The account's copies: path to version. */
  readonly copies: ReadonlyMap<string, string>;
  readonly maxNoteBytes?: number;
  /** The plan's caps; none when absent. */
  readonly caps?: NoteCaps;
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
  const skippedOverLimit = applyCaps(shared, input.copies, input.caps);
  const copies = [...shared.values()]
    .filter((file) => input.copies.get(file.path) !== file.version)
    .map((file) => ({ path: file.path, version: file.version, size: file.size }))
    .sort((left, right) => compare(left.path, right.path));
  const removals = [...input.copies.keys()].filter((path) => !shared.has(path)).sort(compare);
  return { copies, removals, skippedTooLarge, skippedNotNote, skippedOverLimit };
}

/** Drops from `shared` the notes over the caps (existing copies first, then by path) and answers how many it dropped. */
function applyCaps(shared: Map<string, SourceFile>, copies: ReadonlyMap<string, string>, caps: NoteCaps | undefined): number {
  if (caps === undefined || (caps.maxNotes === null && caps.maxBytes === null)) return 0;
  const ordered = [...shared.values()].sort((left, right) => {
    const leftCopied = copies.has(left.path) ? 0 : 1;
    const rightCopied = copies.has(right.path) ? 0 : 1;
    return leftCopied - rightCopied || compare(left.path, right.path);
  });
  let notes = 0;
  let bytes = 0;
  let dropped = 0;
  for (const file of ordered) {
    const fits = (caps.maxNotes === null || notes + 1 <= caps.maxNotes) && (caps.maxBytes === null || bytes + file.size <= caps.maxBytes);
    if (fits) {
      notes += 1;
      bytes += file.size;
    } else {
      shared.delete(file.path);
      dropped += 1;
    }
  }
  return dropped;
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

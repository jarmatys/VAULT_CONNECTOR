// What an assistant may read of an account, decided on every call: the rows of the table of contents that lie inside
// a folder the account shares now. A copy can outlive its pick until the next sync removes it (VC-8); filtering by the
// current picks keeps such a note out of every answer in that window (NFR-2). Every query names the account.
import type { Queryable } from "@softure-ai/db";
import { isPathShared, listSharedFolders } from "../vault/folders/shared-folders.ts";
import { listNotes, type StoredNote } from "../vault/sync/sync-store.ts";

export interface SharedNotes {
  readonly folders: readonly string[];
  readonly notes: readonly StoredNote[];
}

export async function loadSharedNotes(db: Queryable, userId: string): Promise<SharedNotes> {
  const folders = (await listSharedFolders(db, userId)).map((folder) => folder.path);
  if (folders.length === 0) return { folders, notes: [] };
  const notes = (await listNotes(db, userId)).filter((note) => isPathShared(note.path, folders));
  return { folders, notes };
}

/** Case- and accent-insensitive form for matching: marks dropped and the stroked l (U+0142) read as l, so "Lodz" finds its accented form. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[\u0142\u0141]/g, "l").toLowerCase();
}

/**
 * The shared note an assistant's path names: the exact path after NFC normalisation (a leading slash dropped), else the
 * one note whose folded path equals the folded request. Null when none or several fit.
 */
export function resolveNotePath(requested: string, notes: readonly StoredNote[]): StoredNote | null {
  const path = requested.normalize("NFC").trim().replace(/^\/+/, "");
  if (path === "") return null;
  const exact = notes.find((note) => note.path.normalize("NFC") === path);
  if (exact !== undefined) return exact;
  const folded = foldText(path);
  const candidates = notes.filter((note) => foldText(note.path) === folded);
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

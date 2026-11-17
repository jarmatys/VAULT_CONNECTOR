// The folder picker's screen and how saving reports back to it: `?saved=1`, or `?error=<code>` with one of the save's
// codes (anything else in the URL is ignored, so a crafted link cannot put text on the screen).
import { PANEL_PATH } from "../../panel-paths.ts";
import type { SharedFolderErrorCode } from "./shared-folders.ts";

export const FOLDERS_PATH = `${PANEL_PATH}/folders`;

/** A ticked folder posts a field named `folder:<path>` (the checkbox carries no value of its own). */
export const FOLDER_FIELD_PREFIX = "folder:";

/** The folder paths a picker form posted. */
export function readPostedFolders(formData: FormData): string[] {
  return [...formData.keys()].filter((key) => key.startsWith(FOLDER_FIELD_PREFIX)).map((key) => key.slice(FOLDER_FIELD_PREFIX.length));
}

/** Why a save did not go through: a code of the store, or a source that could not list the vault at save time. */
export type FolderSaveErrorCode = SharedFolderErrorCode | "vault.folder_source_failed";

const SAVE_ERRORS: ReadonlySet<string> = new Set<FolderSaveErrorCode>(["vault.folder_unknown", "vault.folder_no_source", "vault.folder_source_failed"]);

export function toFolderResultPath(result: { readonly ok: true } | { readonly ok: false; readonly error: FolderSaveErrorCode }): string {
  return result.ok ? `${FOLDERS_PATH}?saved=1` : `${FOLDERS_PATH}?error=${encodeURIComponent(result.error)}`;
}

/** The save error named in the screen's query, when it is one of the save's codes. */
export function readFolderSaveError(value: string | string[] | undefined): FolderSaveErrorCode | null {
  return typeof value === "string" && SAVE_ERRORS.has(value) ? (value as FolderSaveErrorCode) : null;
}

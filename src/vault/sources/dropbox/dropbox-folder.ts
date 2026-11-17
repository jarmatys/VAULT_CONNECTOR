// The vault's folder in a Dropbox, as the account types it: `Obsidian/My vault`, `/Obsidian/My vault/` or empty for the
// root of what the grant reaches (the app's own folder for an "App folder" app). Stored and sent to Dropbox as
// `/Obsidian/My vault`, or `""` for the root, which is how the API names it.
import { err, ok, type Result } from "@softure-ai/core";

export type DropboxFolderErrorCode = "vault.dropbox_folder_invalid";

/** Dropbox paths are long, but a vault folder this deep is a typo. */
const MAX_FOLDER_LENGTH = 512;

export function parseDropboxFolder(input: string): Result<string, DropboxFolderErrorCode> {
  const trimmed = input.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return ok("");
  if (trimmed.length > MAX_FOLDER_LENGTH) return err("vault.dropbox_folder_invalid");
  // Control characters and backslashes are never part of a path the account means.
  if ([...trimmed].some((character) => character === "\\" || character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) {
    return err("vault.dropbox_folder_invalid");
  }
  const parts = trimmed.split("/");
  if (parts.some((part) => part.trim() === "" || part === "." || part === "..")) return err("vault.dropbox_folder_invalid");
  return ok(`/${parts.join("/")}`);
}

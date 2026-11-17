// The Dropbox adapter of the vault source interface: one folder of an account's Dropbox, read with a read-only grant.
// Like a bucket, a Dropbox folder is followed without a push: the cursor is a hash of the folder's listing (every file
// with its revision), so the five-minute check notices an added, changed, renamed or removed note. A recursive listing
// answers 2 000 entries per call; the adapter keeps the listing it made for its own lifetime (one sync step), and asks
// for an access token once in that lifetime. A read names the revision the listing saw.
import { createHash } from "node:crypto";
import { ok, type Clock, type FetchFunction } from "@softure-ai/core";
import { toSourceFailure, type SourceFile, type SourceResult, type SourceSnapshot, type VaultSource } from "../source.ts";
import {
  continueDropboxListing,
  downloadDropboxRevision,
  listDropboxFolder,
  type DropboxFileEntry,
  type DropboxFolderEntry,
  type DropboxListPage,
} from "./dropbox-api.ts";

/** At most this many files under the folder (25 listing calls); a larger folder answers `source.too_large`. */
export const DEFAULT_MAX_FILES = 50_000;
/** The largest note or attachment one call reads, as for git and S3. */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface DropboxSourceOptions {
  /** `/Obsidian/My vault`, or `""` for the root of the grant (`dropbox-folder.ts`). */
  readonly folder: string;
  /** A usable access token; called at most once per adapter, on its first API call. */
  readonly getAccessToken: () => Promise<SourceResult<string>>;
  readonly fetch?: FetchFunction;
  readonly clock?: Clock;
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
}

export type DropboxSource = VaultSource & { readonly probe: () => Promise<SourceResult<void>> };

export function createDropboxSource(options: DropboxSourceOptions): DropboxSource {
  const callOptions = { ...(options.fetch === undefined ? {} : { fetch: options.fetch }), ...(options.clock === undefined ? {} : { clock: options.clock }) };
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  let token: Promise<SourceResult<string>> | null = null;
  let listing: Promise<SourceResult<SourceSnapshot>> | null = null;

  function readToken(): Promise<SourceResult<string>> {
    token ??= options.getAccessToken().then((result) => {
      // A failed refresh is not kept: the next call tries again.
      if (!result.ok) token = null;
      return result;
    });
    return token;
  }

  async function listAll(): Promise<SourceResult<SourceSnapshot>> {
    const accessToken = await readToken();
    if (!accessToken.ok) return accessToken;
    const files: DropboxFileEntry[] = [];
    const folders: DropboxFolderEntry[] = [];
    let page: SourceResult<DropboxListPage> = await listDropboxFolder(accessToken.value, { path: options.folder, recursive: true }, callOptions);
    for (;;) {
      if (!page.ok) return page;
      files.push(...page.value.files);
      folders.push(...page.value.folders);
      if (files.length > maxFiles) return toSourceFailure("source.too_large");
      if (!page.value.hasMore) break;
      page = await continueDropboxListing(accessToken.value, page.value.cursor, callOptions);
    }
    const snapshot = toSnapshot(options.folder, files, folders);
    return snapshot === null ? toSourceFailure("source.unexpected") : ok(snapshot);
  }

  function readListing(): Promise<SourceResult<SourceSnapshot>> {
    listing ??= listAll().then((result) => {
      if (!result.ok) listing = null;
      return result;
    });
    return listing;
  }

  return {
    kind: "dropbox",

    async getCursor() {
      const snapshot = await readListing();
      return snapshot.ok ? ok(snapshot.value.cursor) : snapshot;
    },

    listTree: readListing,

    async readFile(file) {
      const accessToken = await readToken();
      if (!accessToken.ok) return accessToken;
      return downloadDropboxRevision(accessToken.value, { rev: file.version, maxBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES }, callOptions);
    },

    async listChangesSince(cursor) {
      const snapshot = await readListing();
      if (!snapshot.ok) return snapshot;
      // The listing is the difference: the sync diffs it against its copies, so nothing finer is listed here.
      return ok(snapshot.value.cursor === cursor ? { kind: "changes", cursor, changes: [] } : { kind: "full_resync", cursor: snapshot.value.cursor });
    },

    /** One call: whether the grant reaches the folder and it is a folder, before anything is stored. */
    async probe() {
      const accessToken = await readToken();
      if (!accessToken.ok) return accessToken;
      const page = await listDropboxFolder(accessToken.value, { path: options.folder, recursive: false, limit: 1 }, callOptions);
      return page.ok ? ok(undefined) : page;
    },
  };
}

/**
 * The listing as vault files, relative to the folder. Dropbox keeps the case of the last component of `path_display`
 * only, so every parent is named from its own folder entry (whose `name` is exact) and the path stays the same from
 * one listing to the next. Null when an entry lies outside the folder (an answer the adapter cannot read).
 */
function toSnapshot(folder: string, files: readonly DropboxFileEntry[], folders: readonly DropboxFolderEntry[]): SourceSnapshot | null {
  const root = folder.toLowerCase();
  const prefix = root === "" ? "/" : `${root}/`;
  const folderNames = new Map(folders.map((entry) => [entry.path_lower, entry.name]));
  const vaultFiles: SourceFile[] = [];
  for (const file of files) {
    if (!file.path_lower.startsWith(prefix)) return null;
    const lowerParts = file.path_lower.slice(prefix.length).split("/");
    const displayParts = file.path_display.split("/").slice(-lowerParts.length);
    const names = lowerParts.map((part, index) => {
      if (index === lowerParts.length - 1) return file.name;
      const parentLower = `${prefix}${lowerParts.slice(0, index + 1).join("/")}`;
      return folderNames.get(parentLower) ?? displayParts[index] ?? part;
    });
    vaultFiles.push({ path: names.join("/"), version: file.rev, size: file.size });
  }
  vaultFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { cursor: toCursor(vaultFiles), files: vaultFiles };
}

/** `dropbox-` and the SHA-256 of the sorted `path\trev` lines: equal listings, equal cursors. */
function toCursor(files: readonly SourceFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) hash.update(`${file.path}\t${file.version}\n`);
  return `dropbox-${hash.digest("hex")}`;
}

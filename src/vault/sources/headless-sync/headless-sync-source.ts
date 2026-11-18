// The headless-sync adapter of the vault source interface: one remote vault of the account's sync subscription, read
// over the service's own socket with the account's session token and the vault key. Like Dropbox, the vault is
// followed without a push: the cursor is a hash of the listing (every file with its record id), so the five-minute
// check notices an added, changed, renamed or removed note. The adapter opens one session per lifetime (one sync step),
// lists every record from version 0, decrypts the paths, and pulls a file by the record id the listing named; a record
// that is no longer the file's newest reads as not found. Folders and deleted records are not files.
import { createHash } from "node:crypto";
import { ok } from "@softure-ai/core";
import { toSourceFailure, type SourceFile, type SourceResult, type SourceSnapshot, type VaultSource } from "../source.ts";
import { isAllowedSocketHost } from "./sync-api.ts";
import { CONTENT_OVERHEAD_BYTES, createVaultCipher, type EncryptionVersion, type VaultCipher } from "./sync-crypto.ts";
import { openSyncSession, type SyncSession, type SyncSocketFactory } from "./sync-socket.ts";

/** At most this many files in the vault; a larger one answers `source.too_large`. */
export const DEFAULT_MAX_FILES = 50_000;
/** The largest note or attachment one call reads, as for the other sources. */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface HeadlessSyncVault {
  readonly id: string;
  /** `host[:port]` the service named for the vault's socket. */
  readonly host: string;
  readonly salt: string;
  readonly encryptionVersion: EncryptionVersion;
}

export interface HeadlessSyncSourceOptions {
  readonly vault: HeadlessSyncVault;
  /** The account's session token; never logged. */
  readonly token: string;
  /** The vault key (32 bytes); never logged. */
  readonly key: Uint8Array;
  readonly socketFactory?: SyncSocketFactory;
  /** Only for the end-to-end fake: a loopback socket host over `ws://`. */
  readonly allowLoopback?: boolean;
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly timeoutMs?: number;
}

export type HeadlessSyncSource = VaultSource & { readonly probe: () => Promise<SourceResult<void>> };

interface Listing {
  readonly snapshot: SourceSnapshot;
  readonly uids: ReadonlyMap<string, number>;
}

export function createHeadlessSyncSource(options: HeadlessSyncSourceOptions): HeadlessSyncSource {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  let cipher: Promise<VaultCipher> | null = null;
  let session: SyncSession | null = null;
  let listing: Promise<SourceResult<Listing>> | null = null;

  function readCipher(): Promise<VaultCipher> {
    cipher ??= createVaultCipher(options.key, options.vault.salt, options.vault.encryptionVersion);
    return cipher;
  }

  async function openSession(): Promise<SourceResult<SyncSession>> {
    const isLoopback = options.allowLoopback === true && isAllowedSocketHost(options.vault.host, true) && !isAllowedSocketHost(options.vault.host);
    if (!isAllowedSocketHost(options.vault.host, options.allowLoopback === true)) return toSourceFailure("source.unexpected");
    const opened = await openSyncSession({
      url: `${isLoopback ? "ws" : "wss"}://${options.vault.host}`,
      token: options.token,
      vaultId: options.vault.id,
      keyHash: (await readCipher()).keyHash,
      encryptionVersion: options.vault.encryptionVersion,
      version: 0,
      ...(options.socketFactory === undefined ? {} : { socketFactory: options.socketFactory }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    if (opened.ok) session = opened.value;
    return opened;
  }

  async function listAll(): Promise<SourceResult<Listing>> {
    const opened = await openSession();
    if (!opened.ok) return opened;
    const decrypt = await readCipher();
    // The newest record of each path wins; the service may push a path more than once.
    const latest = new Map<string, { readonly uid: number; readonly size: number; readonly isFile: boolean }>();
    for (const push of opened.value.pushes) {
      const path = await decrypt.decryptString(push.path);
      if (path === null) return toSourceFailure("source.unexpected");
      const previous = latest.get(path);
      if (previous !== undefined && previous.uid > push.uid) continue;
      latest.set(path, { uid: push.uid, size: push.size, isFile: !push.folder && !push.deleted });
    }
    const files: SourceFile[] = [];
    const uids = new Map<string, number>();
    for (const [path, record] of latest) {
      if (!record.isFile || !isVaultPath(path)) continue;
      files.push({ path, version: String(record.uid), size: record.size === 0 ? 0 : Math.max(0, record.size - CONTENT_OVERHEAD_BYTES) });
      uids.set(path, record.uid);
      if (files.length > maxFiles) return toSourceFailure("source.too_large");
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return ok({ snapshot: { cursor: toCursor(files), files }, uids });
  }

  function readListing(): Promise<SourceResult<Listing>> {
    listing ??= listAll().then((result) => {
      if (!result.ok) listing = null;
      return result;
    });
    return listing;
  }

  async function pull(uid: number): Promise<SourceResult<Uint8Array>> {
    const current = session;
    if (current !== null) {
      const first = await current.pull(uid, maxFileBytes + CONTENT_OVERHEAD_BYTES);
      if (first.ok || first.error !== "source.unavailable") return first;
    }
    // The session closed (idle or dropped): one new session, one more try.
    const reopened = await openSession();
    if (!reopened.ok) return reopened;
    return reopened.value.pull(uid, maxFileBytes + CONTENT_OVERHEAD_BYTES);
  }

  return {
    kind: "headless-sync",

    async getCursor() {
      const listed = await readListing();
      return listed.ok ? ok(listed.value.snapshot.cursor) : listed;
    },

    async listTree() {
      const listed = await readListing();
      return listed.ok ? ok(listed.value.snapshot) : listed;
    },

    async readFile(file) {
      const listed = await readListing();
      if (!listed.ok) return listed;
      const uid = listed.value.uids.get(file.path);
      if (uid === undefined || String(uid) !== file.version) return toSourceFailure("source.not_found");
      const encrypted = await pull(uid);
      if (!encrypted.ok) return encrypted;
      const plain = await (await readCipher()).decryptContent(encrypted.value);
      if (plain === null) return toSourceFailure("source.unexpected");
      return plain.byteLength > maxFileBytes ? toSourceFailure("source.too_large") : ok(plain);
    },

    async listChangesSince(cursor) {
      const listed = await readListing();
      if (!listed.ok) return listed;
      const current = listed.value.snapshot.cursor;
      // The listing is the difference: the sync diffs it against its copies, so nothing finer is listed here.
      return ok(current === cursor ? { kind: "changes", cursor, changes: [] } : { kind: "full_resync", cursor: current });
    },

    /** One session: whether the token and the key open the vault, before anything is stored. */
    async probe() {
      const opened = await openSession();
      if (!opened.ok) return opened;
      opened.value.close();
      session = null;
      return ok(undefined);
    },
  };
}

/** A relative, `/`-separated path with no empty, `.` or `..` part (anything else is not stored). */
function isVaultPath(path: string): boolean {
  if (path === "" || path.length > 1024 || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** `headless-sync-` and the SHA-256 of the sorted `path\tuid` lines: equal listings, equal cursors. */
function toCursor(files: readonly SourceFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) hash.update(`${file.path}\t${file.version}\n`);
  return `headless-sync-${hash.digest("hex")}`;
}

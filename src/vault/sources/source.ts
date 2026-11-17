// The vault source interface: what the pipeline (folder picking, sync, index) asks of wherever a vault lives. Git is
// the first adapter (`github/`); an S3 bucket, a Dropbox folder and headless sync (VC-20..VC-22) implement the same
// four calls. A cursor is opaque to the caller: the source's own position (a commit for git, a listing token for a
// bucket), stored by the sync and handed back to `listChangesSince`.
import type { Err, Result } from "@softure-ai/core";

/** The kinds of source an account can connect; each has its adapter folder under `src/vault/sources/`. */
export const SOURCE_KINDS = ["github", "s3"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** One file of the vault at a cursor. `version` names its content (a blob sha, an ETag): equal versions, equal bytes. */
export interface SourceFile {
  /** Relative, `/`-separated, as the source names it. */
  readonly path: string;
  readonly version: string;
  /** Bytes. */
  readonly size: number;
}

export interface SourceSnapshot {
  readonly cursor: string;
  readonly files: readonly SourceFile[];
}

export type SourceChange =
  | { readonly kind: "added" | "modified"; readonly path: string; readonly version: string }
  | { readonly kind: "removed"; readonly path: string }
  | { readonly kind: "renamed"; readonly path: string; readonly previousPath: string; readonly version: string };

/**
 * What changed since a cursor. `full_resync` when the source cannot list the whole difference (history rewritten, a
 * cursor it no longer knows, more changes than one listing holds): the caller lists the tree again at `cursor`.
 */
export type SourceChanges =
  | { readonly kind: "changes"; readonly cursor: string; readonly changes: readonly SourceChange[] }
  | { readonly kind: "full_resync"; readonly cursor: string };

export type SourceErrorCode =
  /** The account's grant is gone: the installation was removed or suspended, the token refused. Reconnect. */
  | "source.disconnected"
  /** The repository, branch or file does not exist (or the grant no longer reaches it). */
  | "source.not_found"
  | "source.rate_limited"
  /** A network failure, a timeout or an outage at the source: retry later. */
  | "source.unavailable"
  /** Larger than one call may read (a file over the cap, a tree the source cuts short). */
  | "source.too_large"
  /** An answer the adapter cannot read. */
  | "source.unexpected";

export type SourceFailure = Err<SourceErrorCode> & {
  /** When to try again, for `rate_limited` and `unavailable`; null when the source did not say. */
  readonly retryAfterSeconds: number | null;
};

export type SourceResult<T> = Result<T, SourceErrorCode> | SourceFailure;

export interface VaultSource {
  readonly kind: SourceKind;
  /** The source's current position (for git, the head commit of the branch). */
  getCursor(): Promise<SourceResult<string>>;
  /** Every file at the current position. */
  listTree(): Promise<SourceResult<SourceSnapshot>>;
  /** One file's bytes, at the version a listing named. */
  readFile(file: Pick<SourceFile, "path" | "version">): Promise<SourceResult<Uint8Array>>;
  /** What changed between `cursor` and the current position. */
  listChangesSince(cursor: string): Promise<SourceResult<SourceChanges>>;
}

/** A failure with its retry hint. */
export function toSourceFailure(error: SourceErrorCode, retryAfterSeconds: number | null = null): SourceFailure {
  return { ok: false, error, retryAfterSeconds };
}

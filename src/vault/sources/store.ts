// The account's source and the link flow's one-time states in the `vault` schema. Every read and write names the
// account (`user_id`), so one account never reaches another's row; the states are found by the sha256 of the value
// that travelled through GitHub or Dropbox, never by the value itself. A source is a git repository, an S3-compatible
// bucket or a Dropbox folder; an S3 key pair and a Dropbox refresh token are stored only sealed, and only the adapter
// that reads the source opens them.
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";

export type SourceStatus = "connected" | "disconnected";

interface StoredSourceBase {
  readonly id: string;
  /** The account the source belongs to; a sealed key pair opens only for it. */
  readonly userId: string;
  readonly status: SourceStatus;
  readonly connectedAt: Date;
  readonly checkedAt: Date;
  readonly disconnectedAt: Date | null;
}

export interface StoredGithubSource extends StoredSourceBase {
  readonly kind: "github";
  readonly installationId: number;
  readonly repositoryId: number;
  readonly repositoryFullName: string;
  readonly defaultBranch: string;
}

export interface StoredS3Source extends StoredSourceBase {
  readonly kind: "s3";
  /** Origin and optional base path, ending with `/`. */
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
  /** The sealed key pair (`s3-credentials.ts`); never shown, never logged. */
  readonly sealedCredentials: string;
}

export interface StoredDropboxSource extends StoredSourceBase {
  readonly kind: "dropbox";
  /** `dbid:…`, the Dropbox account that granted access. */
  readonly accountId: string;
  /** `/Obsidian/My vault`, or `""` for the root of the grant. */
  readonly folder: string;
  /** The sealed refresh token (`dropbox-credentials.ts`); never shown, never logged. */
  readonly sealedCredentials: string;
}

export type StoredSource = StoredGithubSource | StoredS3Source | StoredDropboxSource;

/** Where an S3 vault lives, as stored. */
export interface S3LocationRecord {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
}

/** The source's name for the panel and the assistant: the repository, the bucket at its host, or the Dropbox folder. */
export function getSourceLabel(source: StoredSource): string {
  if (source.kind === "github") return source.repositoryFullName;
  if (source.kind === "dropbox") return source.folder === "" ? "Dropbox" : `${source.folder} (Dropbox)`;
  const host = new URL(source.endpoint).host;
  return `${source.prefix === "" ? source.bucket : `${source.bucket}/${source.prefix}`} (${host})`;
}

export interface GithubRepositoryRecord {
  readonly id: number;
  readonly fullName: string;
  readonly defaultBranch: string;
}

interface SourceRow extends Record<string, unknown> {
  readonly id: string;
  readonly user_id: string;
  readonly kind: string;
  readonly status: string;
  readonly github_installation_id: string | number | null;
  readonly github_repository_id: string | number | null;
  readonly repository_full_name: string | null;
  readonly default_branch: string | null;
  readonly s3_endpoint: string | null;
  readonly s3_region: string | null;
  readonly s3_bucket: string | null;
  readonly s3_prefix: string | null;
  readonly s3_credentials: string | null;
  readonly dropbox_account_id: string | null;
  readonly dropbox_folder: string | null;
  readonly dropbox_credentials: string | null;
  readonly connected_at: string | Date;
  readonly checked_at: string | Date;
  readonly disconnected_at: string | Date | null;
}

const SOURCE_COLUMNS = sql`id, user_id, kind, status, github_installation_id, github_repository_id, repository_full_name, default_branch,
  s3_endpoint, s3_region, s3_bucket, s3_prefix, s3_credentials, dropbox_account_id, dropbox_folder, dropbox_credentials,
  connected_at, checked_at, disconnected_at`;

/** The account's source, or null when it has none. */
export async function findSource(db: Queryable, userId: string): Promise<StoredSource | null> {
  const result = await db.execute<SourceRow>(sql`SELECT ${SOURCE_COLUMNS} FROM vault.sources WHERE user_id = ${userId}`);
  const row = result.rows[0];
  return row === undefined ? null : toSource(row);
}

/**
 * Connects (or reconnects) the account to one repository of an installation; an earlier source is replaced, and its
 * picked folders go when the repository differs.
 */
export async function saveGithubSource(
  db: Queryable,
  input: { readonly userId: string; readonly installationId: number; readonly repository: GithubRepositoryRecord; readonly now: Date },
): Promise<StoredGithubSource> {
  const now = input.now.toISOString();
  // Picks name folders of one repository; another repository (or a bucket) starts with none (nothing shared before a
  // pick).
  await db.execute(sql`
    DELETE FROM vault.shared_folders WHERE user_id = ${input.userId}
      AND source_id IN (SELECT id FROM vault.sources WHERE user_id = ${input.userId}
        AND (kind <> 'github' OR github_repository_id <> ${input.repository.id}))`);
  const result = await db.execute<SourceRow>(sql`
    INSERT INTO vault.sources (user_id, kind, status, github_installation_id, github_repository_id, repository_full_name,
      default_branch, connected_at, checked_at, disconnected_at)
    VALUES (${input.userId}, 'github', 'connected', ${input.installationId}, ${input.repository.id},
      ${input.repository.fullName}, ${input.repository.defaultBranch}, ${now}, ${now}, NULL)
    ON CONFLICT (user_id) DO UPDATE SET kind = EXCLUDED.kind, status = 'connected',
      github_installation_id = EXCLUDED.github_installation_id, github_repository_id = EXCLUDED.github_repository_id,
      repository_full_name = EXCLUDED.repository_full_name, default_branch = EXCLUDED.default_branch,
      s3_endpoint = NULL, s3_region = NULL, s3_bucket = NULL, s3_prefix = NULL, s3_credentials = NULL,
      dropbox_account_id = NULL, dropbox_folder = NULL, dropbox_credentials = NULL,
      connected_at = EXCLUDED.connected_at, checked_at = EXCLUDED.checked_at, disconnected_at = NULL
    RETURNING ${SOURCE_COLUMNS}`);
  const row = result.rows[0];
  if (row === undefined) throw new Error("Saving the account's GitHub source returned no row");
  return toSource(row) as StoredGithubSource;
}

/**
 * Connects (or reconnects, with new keys) the account to an S3 location; an earlier source is replaced, and its picked
 * folders go when the location differs.
 */
export async function saveS3Source(
  db: Queryable,
  input: { readonly userId: string; readonly location: S3LocationRecord; readonly sealedCredentials: string; readonly now: Date },
): Promise<StoredS3Source> {
  const now = input.now.toISOString();
  const { endpoint, region, bucket, prefix } = input.location;
  await db.execute(sql`
    DELETE FROM vault.shared_folders WHERE user_id = ${input.userId}
      AND source_id IN (SELECT id FROM vault.sources WHERE user_id = ${input.userId}
        AND (kind <> 's3' OR s3_endpoint <> ${endpoint} OR s3_bucket <> ${bucket} OR s3_prefix <> ${prefix}))`);
  const result = await db.execute<SourceRow>(sql`
    INSERT INTO vault.sources (user_id, kind, status, s3_endpoint, s3_region, s3_bucket, s3_prefix, s3_credentials,
      connected_at, checked_at, disconnected_at)
    VALUES (${input.userId}, 's3', 'connected', ${endpoint}, ${region}, ${bucket}, ${prefix}, ${input.sealedCredentials},
      ${now}, ${now}, NULL)
    ON CONFLICT (user_id) DO UPDATE SET kind = EXCLUDED.kind, status = 'connected',
      github_installation_id = NULL, github_repository_id = NULL, repository_full_name = NULL, default_branch = NULL,
      s3_endpoint = EXCLUDED.s3_endpoint, s3_region = EXCLUDED.s3_region, s3_bucket = EXCLUDED.s3_bucket,
      s3_prefix = EXCLUDED.s3_prefix, s3_credentials = EXCLUDED.s3_credentials,
      dropbox_account_id = NULL, dropbox_folder = NULL, dropbox_credentials = NULL,
      connected_at = EXCLUDED.connected_at, checked_at = EXCLUDED.checked_at, disconnected_at = NULL
    RETURNING ${SOURCE_COLUMNS}`);
  const row = result.rows[0];
  if (row === undefined) throw new Error("Saving the account's S3 source returned no row");
  return toSource(row) as StoredS3Source;
}

/**
 * Connects (or reconnects, with a new grant) the account to a Dropbox folder; an earlier source is replaced, and its
 * picked folders go when the Dropbox account or the folder differs.
 */
export async function saveDropboxSource(
  db: Queryable,
  input: { readonly userId: string; readonly accountId: string; readonly folder: string; readonly sealedCredentials: string; readonly now: Date },
): Promise<StoredDropboxSource> {
  const now = input.now.toISOString();
  await db.execute(sql`
    DELETE FROM vault.shared_folders WHERE user_id = ${input.userId}
      AND source_id IN (SELECT id FROM vault.sources WHERE user_id = ${input.userId}
        AND (kind <> 'dropbox' OR dropbox_account_id <> ${input.accountId} OR lower(dropbox_folder) <> lower(${input.folder})))`);
  const result = await db.execute<SourceRow>(sql`
    INSERT INTO vault.sources (user_id, kind, status, dropbox_account_id, dropbox_folder, dropbox_credentials,
      connected_at, checked_at, disconnected_at)
    VALUES (${input.userId}, 'dropbox', 'connected', ${input.accountId}, ${input.folder}, ${input.sealedCredentials},
      ${now}, ${now}, NULL)
    ON CONFLICT (user_id) DO UPDATE SET kind = EXCLUDED.kind, status = 'connected',
      github_installation_id = NULL, github_repository_id = NULL, repository_full_name = NULL, default_branch = NULL,
      s3_endpoint = NULL, s3_region = NULL, s3_bucket = NULL, s3_prefix = NULL, s3_credentials = NULL,
      dropbox_account_id = EXCLUDED.dropbox_account_id, dropbox_folder = EXCLUDED.dropbox_folder,
      dropbox_credentials = EXCLUDED.dropbox_credentials,
      connected_at = EXCLUDED.connected_at, checked_at = EXCLUDED.checked_at, disconnected_at = NULL
    RETURNING ${SOURCE_COLUMNS}`);
  const row = result.rows[0];
  if (row === undefined) throw new Error("Saving the account's Dropbox source returned no row");
  return toSource(row) as StoredDropboxSource;
}

/**
 * Records a check of the account's source: still connected (with the repository's current name and branch), or
 * disconnected (the first time keeps its moment). Answers the row as it is now, or null when the account has none.
 */
export async function recordSourceCheck(
  db: Queryable,
  input: { readonly userId: string; readonly now: Date; readonly outcome: { readonly kind: "connected"; readonly repository: GithubRepositoryRecord } | { readonly kind: "disconnected" } },
): Promise<StoredSource | null> {
  const now = input.now.toISOString();
  const result =
    input.outcome.kind === "connected"
      ? await db.execute<SourceRow>(sql`
          UPDATE vault.sources SET status = 'connected', disconnected_at = NULL, checked_at = ${now},
            repository_full_name = ${input.outcome.repository.fullName}, default_branch = ${input.outcome.repository.defaultBranch}
          WHERE user_id = ${input.userId} AND kind = 'github' AND github_repository_id = ${input.outcome.repository.id}
          RETURNING ${SOURCE_COLUMNS}`)
      : await db.execute<SourceRow>(sql`
          UPDATE vault.sources SET status = 'disconnected', checked_at = ${now}, disconnected_at = COALESCE(disconnected_at, ${now})
          WHERE user_id = ${input.userId}
          RETURNING ${SOURCE_COLUMNS}`);
  const row = result.rows[0];
  return row === undefined ? null : toSource(row);
}

/** Forgets the account's source (a GitHub installation stays until the account removes it there; Dropbox: `link.ts`). */
export async function deleteSource(db: Queryable, userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM vault.sources WHERE user_id = ${userId}`);
}

/**
 * Starts a link: the account's expired states go, the new one is stored by its hash. A Dropbox link carries the folder
 * the account named; a GitHub link carries none.
 */
export async function createLinkState(
  db: Queryable,
  input: {
    readonly userId: string;
    readonly stateHash: string;
    readonly codeVerifier: string;
    readonly now: Date;
    readonly expiresAt: Date;
    readonly dropboxFolder?: string;
  },
): Promise<void> {
  const kind = input.dropboxFolder === undefined ? "github" : "dropbox";
  await db.execute(sql`DELETE FROM vault.source_link_states WHERE user_id = ${input.userId} AND expires_at <= ${input.now.toISOString()}`);
  await db.execute(sql`
    INSERT INTO vault.source_link_states (state_hash, user_id, code_verifier, created_at, expires_at, kind, dropbox_folder)
    VALUES (${input.stateHash}, ${input.userId}, ${input.codeVerifier}, ${input.now.toISOString()}, ${input.expiresAt.toISOString()},
      ${kind}, ${input.dropboxFolder ?? null})`);
}

/**
 * The setup step: records the installation id on the account's live state that has none yet and answers the state's
 * PKCE verifier; null when no such state exists (another account's, expired, already set up, consumed).
 */
export async function attachInstallationToLinkState(
  db: Queryable,
  input: { readonly userId: string; readonly stateHash: string; readonly installationId: number; readonly now: Date },
): Promise<string | null> {
  const result = await db.execute<{ code_verifier: string }>(sql`
    UPDATE vault.source_link_states SET github_installation_id = ${input.installationId}
    WHERE state_hash = ${input.stateHash} AND user_id = ${input.userId} AND expires_at > ${input.now.toISOString()}
      AND kind = 'github' AND github_installation_id IS NULL
    RETURNING code_verifier`);
  return result.rows[0]?.code_verifier ?? null;
}

/** The callback step: deletes the account's live, set-up state and answers what it carried; null when there is none. */
export async function consumeLinkState(
  db: Queryable,
  input: { readonly userId: string; readonly stateHash: string; readonly now: Date },
): Promise<{ readonly installationId: number; readonly codeVerifier: string } | null> {
  const result = await db.execute<{ github_installation_id: string | number | null; code_verifier: string; expires_at: string | Date }>(sql`
    DELETE FROM vault.source_link_states
    WHERE state_hash = ${input.stateHash} AND user_id = ${input.userId} AND kind = 'github'
    RETURNING github_installation_id, code_verifier, expires_at`);
  const row = result.rows[0];
  if (row === undefined || row.github_installation_id === null) return null;
  if (toDate(row.expires_at).getTime() <= input.now.getTime()) return null;
  return { installationId: Number(row.github_installation_id), codeVerifier: row.code_verifier };
}

/** The Dropbox callback step: deletes the account's live Dropbox state and answers what it carried; null when there is none. */
export async function consumeDropboxLinkState(
  db: Queryable,
  input: { readonly userId: string; readonly stateHash: string; readonly now: Date },
): Promise<{ readonly folder: string; readonly codeVerifier: string } | null> {
  const result = await db.execute<{ dropbox_folder: string | null; code_verifier: string; expires_at: string | Date }>(sql`
    DELETE FROM vault.source_link_states
    WHERE state_hash = ${input.stateHash} AND user_id = ${input.userId} AND kind = 'dropbox'
    RETURNING dropbox_folder, code_verifier, expires_at`);
  const row = result.rows[0];
  if (row === undefined || row.dropbox_folder === null) return null;
  if (toDate(row.expires_at).getTime() <= input.now.getTime()) return null;
  return { folder: row.dropbox_folder, codeVerifier: row.code_verifier };
}

function toSource(row: SourceRow): StoredSource {
  if (row.status !== "connected" && row.status !== "disconnected") {
    throw new Error(`Reading a vault source: unknown status (${row.status})`);
  }
  const base: StoredSourceBase = {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    connectedAt: toDate(row.connected_at),
    checkedAt: toDate(row.checked_at),
    disconnectedAt: row.disconnected_at === null ? null : toDate(row.disconnected_at),
  };
  if (row.kind === "github" && row.github_installation_id !== null && row.github_repository_id !== null && row.repository_full_name !== null && row.default_branch !== null) {
    return {
      ...base,
      kind: "github",
      installationId: Number(row.github_installation_id),
      repositoryId: Number(row.github_repository_id),
      repositoryFullName: row.repository_full_name,
      defaultBranch: row.default_branch,
    };
  }
  if (row.kind === "s3" && row.s3_endpoint !== null && row.s3_region !== null && row.s3_bucket !== null && row.s3_prefix !== null && row.s3_credentials !== null) {
    return { ...base, kind: "s3", endpoint: row.s3_endpoint, region: row.s3_region, bucket: row.s3_bucket, prefix: row.s3_prefix, sealedCredentials: row.s3_credentials };
  }
  if (row.kind === "dropbox" && row.dropbox_account_id !== null && row.dropbox_folder !== null && row.dropbox_credentials !== null) {
    return { ...base, kind: "dropbox", accountId: row.dropbox_account_id, folder: row.dropbox_folder, sealedCredentials: row.dropbox_credentials };
  }
  throw new Error(`Reading a vault source: unknown kind or missing fields (${row.kind})`);
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

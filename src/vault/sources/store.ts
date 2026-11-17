// The account's source and the link flow's one-time states in the `vault` schema. Every read and write names the
// account (`user_id`), so one account never reaches another's row; the states are found by the sha256 of the value
// that travelled through GitHub, never by the value itself.
import type { Queryable } from "@softure-ai/db";
import { sql } from "drizzle-orm";

export type SourceStatus = "connected" | "disconnected";

export interface StoredGithubSource {
  readonly id: string;
  readonly kind: "github";
  readonly status: SourceStatus;
  readonly installationId: number;
  readonly repositoryId: number;
  readonly repositoryFullName: string;
  readonly defaultBranch: string;
  readonly connectedAt: Date;
  readonly checkedAt: Date;
  readonly disconnectedAt: Date | null;
}

export interface GithubRepositoryRecord {
  readonly id: number;
  readonly fullName: string;
  readonly defaultBranch: string;
}

interface SourceRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly github_installation_id: string | number;
  readonly github_repository_id: string | number;
  readonly repository_full_name: string;
  readonly default_branch: string;
  readonly connected_at: string | Date;
  readonly checked_at: string | Date;
  readonly disconnected_at: string | Date | null;
}

const SOURCE_COLUMNS = sql`id, kind, status, github_installation_id, github_repository_id, repository_full_name, default_branch, connected_at, checked_at, disconnected_at`;

/** The account's source, or null when it has none. */
export async function findSource(db: Queryable, userId: string): Promise<StoredGithubSource | null> {
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
  // Picks name folders of one repository; another repository starts with none (nothing shared before a pick).
  await db.execute(sql`
    DELETE FROM vault.shared_folders WHERE user_id = ${input.userId}
      AND source_id IN (SELECT id FROM vault.sources WHERE user_id = ${input.userId} AND github_repository_id <> ${input.repository.id})`);
  const result = await db.execute<SourceRow>(sql`
    INSERT INTO vault.sources (user_id, kind, status, github_installation_id, github_repository_id, repository_full_name,
      default_branch, connected_at, checked_at, disconnected_at)
    VALUES (${input.userId}, 'github', 'connected', ${input.installationId}, ${input.repository.id},
      ${input.repository.fullName}, ${input.repository.defaultBranch}, ${now}, ${now}, NULL)
    ON CONFLICT (user_id) DO UPDATE SET kind = EXCLUDED.kind, status = 'connected',
      github_installation_id = EXCLUDED.github_installation_id, github_repository_id = EXCLUDED.github_repository_id,
      repository_full_name = EXCLUDED.repository_full_name, default_branch = EXCLUDED.default_branch,
      connected_at = EXCLUDED.connected_at, checked_at = EXCLUDED.checked_at, disconnected_at = NULL
    RETURNING ${SOURCE_COLUMNS}`);
  const row = result.rows[0];
  if (row === undefined) throw new Error("Saving the account's GitHub source returned no row");
  return toSource(row);
}

/**
 * Records a check of the account's source: still connected (with the repository's current name and branch), or
 * disconnected (the first time keeps its moment). Answers the row as it is now, or null when the account has none.
 */
export async function recordSourceCheck(
  db: Queryable,
  input: { readonly userId: string; readonly now: Date; readonly outcome: { readonly kind: "connected"; readonly repository: GithubRepositoryRecord } | { readonly kind: "disconnected" } },
): Promise<StoredGithubSource | null> {
  const now = input.now.toISOString();
  const result =
    input.outcome.kind === "connected"
      ? await db.execute<SourceRow>(sql`
          UPDATE vault.sources SET status = 'connected', disconnected_at = NULL, checked_at = ${now},
            repository_full_name = ${input.outcome.repository.fullName}, default_branch = ${input.outcome.repository.defaultBranch}
          WHERE user_id = ${input.userId} AND github_repository_id = ${input.outcome.repository.id}
          RETURNING ${SOURCE_COLUMNS}`)
      : await db.execute<SourceRow>(sql`
          UPDATE vault.sources SET status = 'disconnected', checked_at = ${now}, disconnected_at = COALESCE(disconnected_at, ${now})
          WHERE user_id = ${input.userId}
          RETURNING ${SOURCE_COLUMNS}`);
  const row = result.rows[0];
  return row === undefined ? null : toSource(row);
}

/** Forgets the account's source (the installation stays on GitHub until the account removes it there). */
export async function deleteSource(db: Queryable, userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM vault.sources WHERE user_id = ${userId}`);
}

/** Starts a link: the account's expired states go, the new one is stored by its hash. */
export async function createLinkState(
  db: Queryable,
  input: { readonly userId: string; readonly stateHash: string; readonly codeVerifier: string; readonly now: Date; readonly expiresAt: Date },
): Promise<void> {
  await db.execute(sql`DELETE FROM vault.source_link_states WHERE user_id = ${input.userId} AND expires_at <= ${input.now.toISOString()}`);
  await db.execute(sql`
    INSERT INTO vault.source_link_states (state_hash, user_id, code_verifier, created_at, expires_at)
    VALUES (${input.stateHash}, ${input.userId}, ${input.codeVerifier}, ${input.now.toISOString()}, ${input.expiresAt.toISOString()})`);
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
      AND github_installation_id IS NULL
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
    WHERE state_hash = ${input.stateHash} AND user_id = ${input.userId}
    RETURNING github_installation_id, code_verifier, expires_at`);
  const row = result.rows[0];
  if (row === undefined || row.github_installation_id === null) return null;
  if (toDate(row.expires_at).getTime() <= input.now.getTime()) return null;
  return { installationId: Number(row.github_installation_id), codeVerifier: row.code_verifier };
}

function toSource(row: SourceRow): StoredGithubSource {
  if (row.kind !== "github" || (row.status !== "connected" && row.status !== "disconnected")) {
    throw new Error(`Reading a vault source: unknown kind or status (${row.kind}, ${row.status})`);
  }
  return {
    id: row.id,
    kind: "github",
    status: row.status,
    installationId: Number(row.github_installation_id),
    repositoryId: Number(row.github_repository_id),
    repositoryFullName: row.repository_full_name,
    defaultBranch: row.default_branch,
    connectedAt: toDate(row.connected_at),
    checkedAt: toDate(row.checked_at),
    disconnectedAt: row.disconnected_at === null ? null : toDate(row.disconnected_at),
  };
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

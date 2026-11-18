// The Dropbox API v2 calls the source makes: the OAuth token grants (authorization code with PKCE, refresh, revoke)
// through `@softure-ai/connections/user-oauth`, and the folder listing and a file download at one revision over core's
// HTTP helpers. Every
// failure becomes a source code, so the adapter, the link flow and the sync speak the same language. Tokens and
// secrets go only into headers and form bodies, never into a URL, an error or a log.
import { ok, requestBytes, requestJson, type Clock, type FetchFunction, type HttpBytesFailure, type HttpJsonFailure } from "@softure-ai/core";
import {
  defineUserOAuthProvider,
  exchangeUserCode,
  refreshUserAccessToken,
  revokeUserGrant,
  type UserOAuthClient,
  type UserOAuthFailure,
  type UserOAuthProvider,
} from "@softure-ai/connections/user-oauth";
import { z } from "zod";
import { toSourceFailure, type SourceErrorCode, type SourceResult } from "../source.ts";

export const DROPBOX_WEB_ORIGIN = "https://www.dropbox.com";
export const DROPBOX_API_ORIGIN = "https://api.dropboxapi.com";
export const DROPBOX_CONTENT_ORIGIN = "https://content.dropboxapi.com";

/** The read-only pair: list and read files, nothing else. */
export const DROPBOX_SCOPES: readonly string[] = ["files.metadata.read", "files.content.read"];

/** One listing call answers at most this many entries (Dropbox's own limit). */
const LIST_PAGE_LIMIT = 2000;

export interface DropboxCallOptions {
  readonly fetch?: FetchFunction;
  readonly clock?: Clock;
}

/** The product's Dropbox app: its key (client id) and secret; the secret is never logged. */
export interface DropboxAppCredentials {
  readonly appKey: string;
  readonly appSecret: string;
}

/** The product's Dropbox app as a user-OAuth provider: PKCE, offline access (a refresh token), the read-only pair. */
export function getDropboxOAuthProvider(webOrigin: string = DROPBOX_WEB_ORIGIN): UserOAuthProvider {
  return defineUserOAuthProvider({
    id: "dropbox",
    authorizeUrl: `${webOrigin}/oauth2/authorize`,
    tokenUrl: `${DROPBOX_API_ORIGIN}/oauth2/token`,
    revoke: { style: "bearer", url: `${DROPBOX_API_ORIGIN}/2/auth/token/revoke` },
    scopes: [...DROPBOX_SCOPES],
    authorizeParams: { token_access_type: "offline" },
  });
}

const DROPBOX_OAUTH = getDropboxOAuthProvider();

export interface DropboxGrant {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** The scopes Dropbox granted, as it listed them. */
  readonly scopes: readonly string[];
  readonly accountId: string;
}

/** Exchanges an authorization code (with its PKCE verifier) for a refresh token and a first access token. */
export async function exchangeDropboxCode(
  app: DropboxAppCredentials,
  input: { readonly code: string; readonly redirectUri: string; readonly codeVerifier: string },
  options: DropboxCallOptions = {},
): Promise<SourceResult<DropboxGrant>> {
  const answer = await exchangeUserCode(DROPBOX_OAUTH, toClient(app), input, withOptions(options));
  if (!answer.ok) return toTokenFailure(answer);
  const accountId = answer.value.fields.account_id;
  if (answer.value.refreshToken === null || accountId === undefined) return toSourceFailure("source.unexpected");
  return ok({ accessToken: answer.value.accessToken, refreshToken: answer.value.refreshToken, scopes: answer.value.scopes, accountId });
}

/** A fresh access token for a stored refresh token; a refused refresh token is `source.disconnected`. */
export async function refreshDropboxToken(app: DropboxAppCredentials, refreshToken: string, options: DropboxCallOptions = {}): Promise<SourceResult<string>> {
  const answer = await refreshUserAccessToken(DROPBOX_OAUTH, toClient(app), refreshToken, withOptions(options));
  return answer.ok ? ok(answer.value.accessToken) : toTokenFailure(answer);
}

/** Revokes the grant behind an access token (its refresh token too). Best effort: the answer is not needed. */
export function revokeDropboxToken(app: DropboxAppCredentials, accessToken: string, options: DropboxCallOptions = {}): Promise<boolean> {
  return revokeUserGrant(DROPBOX_OAUTH, toClient(app), accessToken, withOptions(options));
}

function toClient(app: DropboxAppCredentials): UserOAuthClient {
  return { clientId: app.appKey, clientSecret: app.appSecret };
}

const fileEntry = z.object({
  ".tag": z.literal("file"),
  name: z.string(),
  path_lower: z.string(),
  path_display: z.string(),
  rev: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
});
const folderEntry = z.object({ ".tag": z.literal("folder"), name: z.string(), path_lower: z.string(), path_display: z.string() });
const otherEntry = z.object({ ".tag": z.string() }).loose();
const listAnswer = z.object({
  entries: z.array(z.union([fileEntry, folderEntry, otherEntry])),
  cursor: z.string().min(1),
  has_more: z.boolean(),
});

export type DropboxFileEntry = z.output<typeof fileEntry>;
export type DropboxFolderEntry = z.output<typeof folderEntry>;

export interface DropboxListPage {
  readonly files: readonly DropboxFileEntry[];
  readonly folders: readonly DropboxFolderEntry[];
  readonly cursor: string;
  readonly hasMore: boolean;
}

/** The first page of a folder's listing (every level below it when `recursive`). `""` is the root of the grant. */
export function listDropboxFolder(
  accessToken: string,
  input: { readonly path: string; readonly recursive: boolean; readonly limit?: number },
  options: DropboxCallOptions = {},
): Promise<SourceResult<DropboxListPage>> {
  return listPage(accessToken, "/2/files/list_folder", { path: input.path, recursive: input.recursive, include_deleted: false, include_mounted_folders: true, limit: input.limit ?? LIST_PAGE_LIMIT }, options);
}

/** The next page of a listing. */
export function continueDropboxListing(accessToken: string, cursor: string, options: DropboxCallOptions = {}): Promise<SourceResult<DropboxListPage>> {
  return listPage(accessToken, "/2/files/list_folder/continue", { cursor }, options);
}

async function listPage(accessToken: string, path: string, body: Readonly<Record<string, unknown>>, options: DropboxCallOptions): Promise<SourceResult<DropboxListPage>> {
  const answer = await requestJson({ url: `${DROPBOX_API_ORIGIN}${path}`, method: "POST", body, headers: { authorization: `Bearer ${accessToken}` }, schema: listAnswer, ...withOptions(options) });
  if (!answer.ok) return toApiFailure(answer);
  if (answer.value === undefined) return toSourceFailure("source.unexpected");
  const files: DropboxFileEntry[] = [];
  const folders: DropboxFolderEntry[] = [];
  for (const entry of answer.value.entries) {
    const file = fileEntry.safeParse(entry);
    if (file.success) {
      files.push(file.data);
      continue;
    }
    const folder = folderEntry.safeParse(entry);
    if (folder.success) folders.push(folder.data);
  }
  return ok({ files, folders, cursor: answer.value.cursor, hasMore: answer.value.has_more });
}

/** One file's bytes at exactly the revision a listing named; a revision that no longer exists is `source.not_found`. */
export async function downloadDropboxRevision(accessToken: string, input: { readonly rev: string; readonly maxBytes: number }, options: DropboxCallOptions = {}): Promise<SourceResult<Uint8Array>> {
  const answer = await requestBytes({
    url: `${DROPBOX_CONTENT_ORIGIN}/2/files/download`,
    method: "POST",
    // The argument travels in a header, which must stay ASCII: a revision is.
    headers: { authorization: `Bearer ${accessToken}`, "dropbox-api-arg": JSON.stringify({ path: `rev:${input.rev}` }) },
    maxBytes: input.maxBytes,
    ...withOptions(options),
  });
  return answer.ok ? ok(answer.value.bytes) : toApiFailure(answer);
}

function withOptions(options: DropboxCallOptions): DropboxCallOptions {
  return { ...(options.fetch === undefined ? {} : { fetch: options.fetch }), ...(options.clock === undefined ? {} : { clock: options.clock }) };
}

/**
 * An API failure as a source code: 401 (a token Dropbox no longer accepts) and 403 (no access) disconnected; 409 (an
 * endpoint error such as `path/not_found` or a revision that is gone) not found; 429 rate limited; 5xx and the
 * network unavailable; anything else unexpected.
 */
export function toApiFailure(answer: HttpJsonFailure | HttpBytesFailure): SourceResult<never> {
  const retryAfter = "retryAfterSeconds" in answer ? answer.retryAfterSeconds : null;
  return toSourceFailure(toApiCode(answer), retryAfter);
}

function toApiCode(answer: HttpJsonFailure | HttpBytesFailure): SourceErrorCode {
  switch (answer.error) {
    case "core.http_refused":
      return answer.status === 401 || answer.status === 403 ? "source.disconnected" : "source.unexpected";
    case "core.http_conflict":
      return "source.not_found";
    case "core.http_rate_limited":
      return "source.rate_limited";
    case "core.http_unreachable":
    case "core.http_unavailable":
      return "source.unavailable";
    case "core.http_too_large":
      return "source.too_large";
    case "core.http_unexpected_answer":
      return "source.unexpected";
  }
}

/**
 * A token grant's failure: a dead grant (`invalid_grant`) and a refused client are disconnected; a rate limit,
 * an outage or no answer are retryable; anything else is unexpected.
 */
function toTokenFailure(failure: UserOAuthFailure): SourceResult<never> {
  if (failure.error === "connections.user_oauth_reconnect_required") return toSourceFailure("source.disconnected");
  if (failure.error === "connections.user_oauth_rejected") {
    return DISCONNECTING_OAUTH_ERRORS.has(failure.oauthError ?? "") ? toSourceFailure("source.disconnected") : toSourceFailure("source.unexpected");
  }
  if (failure.status === 429) return toSourceFailure("source.rate_limited");
  return toSourceFailure(failure.status === null || failure.status >= 500 ? "source.unavailable" : "source.unexpected");
}

const DISCONNECTING_OAUTH_ERRORS: ReadonlySet<string> = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);

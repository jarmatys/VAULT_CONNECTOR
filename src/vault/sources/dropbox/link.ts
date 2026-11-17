// Linking an account to one folder of its Dropbox, read-only, and opening it later.
//
// 1. `startDropboxLink`: the account names the vault's folder; a one-time state (only its sha256 stored, bound to the
//    account, ten minutes) carries the folder and a PKCE verifier, and the browser goes to Dropbox's consent page with
//    the two read-only scopes and offline access (a refresh token).
// 2. `completeDropboxLink`: Dropbox's redirect carries the code and the state. The state is consumed; the code is
//    exchanged; a grant with any write scope is refused (and revoked), since the product only reads; the folder must
//    exist in what the grant reaches. Only then is the refresh token sealed to the account and the source saved.
// `openDropboxSource` turns a saved source into the vault source the sync and the folder picker read;
// `revokeDropboxSource` revokes the grant when the account disconnects.
import { err, ok, type Clock, type FetchFunction, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { DropboxSourceSettings } from "../../settings.ts";
import { consumeDropboxLinkState, createLinkState, saveDropboxSource, type StoredDropboxSource } from "../store.ts";
import { DROPBOX_SCOPES, DROPBOX_WEB_ORIGIN, exchangeDropboxCode, refreshDropboxToken, revokeDropboxToken, type DropboxAppCredentials } from "./dropbox-api.ts";
import { openDropboxRefreshToken, sealDropboxRefreshToken } from "./dropbox-credentials.ts";
import { parseDropboxFolder, type DropboxFolderErrorCode } from "./dropbox-folder.ts";
import { createDropboxSource, type DropboxSource } from "./dropbox-source.ts";

/** Where Dropbox sends the browser back; registered on the Dropbox app as its redirect URI. */
export const DROPBOX_CALLBACK_PATH = "/panel/source/dropbox/callback";

const LINK_STATE_TTL_MS = 10 * 60 * 1000;

/** Why a link did not complete; the Dropbox screen names each. */
export type DropboxLinkErrorCode =
  | DropboxFolderErrorCode
  /** The state is unknown, expired, already used, or another account's. */
  | "vault.dropbox_link_expired"
  /** The person declined on Dropbox, or Dropbox refused the code. */
  | "vault.dropbox_denied"
  /** The grant carries a write scope, or lacks a read one. */
  | "vault.dropbox_permissions"
  /** The folder does not exist in what the grant reaches, or is a file. */
  | "vault.dropbox_folder_not_found"
  /** Dropbox did not answer, or answered something unreadable: try again. */
  | "vault.dropbox_unavailable";

export const DROPBOX_LINK_ERROR_CODES: readonly DropboxLinkErrorCode[] = [
  "vault.dropbox_folder_invalid",
  "vault.dropbox_link_expired",
  "vault.dropbox_denied",
  "vault.dropbox_permissions",
  "vault.dropbox_folder_not_found",
  "vault.dropbox_unavailable",
];

export type ConfiguredDropboxSettings = Extract<DropboxSourceSettings, { kind: "configured" }>;

export interface DropboxLinkContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly settings: ConfiguredDropboxSettings;
  /** The public origin the redirect URI is built from (`APP_ORIGIN`), never a request header. */
  readonly appOrigin: string;
  readonly fetch?: FetchFunction;
  /** Where the browser meets Dropbox's consent page; end-to-end tests point it at the fake. */
  readonly webOrigin?: string;
}

/** Starts a link for the account and answers Dropbox's consent URL, or why the folder cannot be used. */
export async function startDropboxLink(ctx: DropboxLinkContext, userId: string, folderInput: string): Promise<Result<URL, DropboxFolderErrorCode>> {
  const folder = parseDropboxFolder(folderInput);
  if (!folder.ok) return folder;
  const state = createRandomToken();
  const verifier = createRandomToken();
  const now = ctx.clock.now();
  await createLinkState(ctx.db, { userId, stateHash: await hashToken(state), codeVerifier: verifier, now, expiresAt: new Date(now.getTime() + LINK_STATE_TTL_MS), dropboxFolder: folder.value });
  const url = new URL(`${ctx.webOrigin ?? DROPBOX_WEB_ORIGIN}/oauth2/authorize`);
  url.searchParams.set("client_id", ctx.settings.appKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUrl(ctx));
  url.searchParams.set("state", state);
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("scope", DROPBOX_SCOPES.join(" "));
  url.searchParams.set("code_challenge", await createChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return ok(url);
}

export interface DropboxCallbackParams {
  readonly state: string | null;
  readonly code: string | null;
  readonly error: string | null;
}

/** The consent callback: checks the grant and the folder, then seals the refresh token and saves the source. */
export async function completeDropboxLink(ctx: DropboxLinkContext, userId: string, params: DropboxCallbackParams): Promise<Result<StoredDropboxSource, DropboxLinkErrorCode>> {
  if (params.state === null) return err("vault.dropbox_link_expired");
  const link = await consumeDropboxLinkState(ctx.db, { userId, stateHash: await hashToken(params.state), now: ctx.clock.now() });
  if (link === null) return err("vault.dropbox_link_expired");
  if (params.error !== null || params.code === null) return err("vault.dropbox_denied");

  const callOptions = toCallOptions(ctx);
  const grant = await exchangeDropboxCode(toApp(ctx.settings), { code: params.code, redirectUri: callbackUrl(ctx), codeVerifier: link.codeVerifier }, callOptions);
  if (!grant.ok) return err(grant.error === "source.disconnected" ? "vault.dropbox_denied" : "vault.dropbox_unavailable");
  if (!isReadOnlyGrant(grant.value.scopes)) {
    await revokeDropboxToken(grant.value.accessToken, callOptions);
    return err("vault.dropbox_permissions");
  }
  if (!/^dbid:[A-Za-z0-9_-]{1,100}$/.test(grant.value.accountId)) return err("vault.dropbox_unavailable");

  const probe = await createDropboxSource({ folder: link.folder, getAccessToken: () => Promise.resolve(ok(grant.value.accessToken)), ...callOptions }).probe();
  if (!probe.ok) {
    if (probe.error === "source.not_found") return err("vault.dropbox_folder_not_found");
    return err(probe.error === "source.disconnected" ? "vault.dropbox_permissions" : "vault.dropbox_unavailable");
  }

  const saved = await saveDropboxSource(ctx.db, {
    userId,
    accountId: grant.value.accountId,
    folder: link.folder,
    sealedCredentials: sealDropboxRefreshToken(ctx.settings.keyring, userId, grant.value.refreshToken),
    now: ctx.clock.now(),
  });
  return ok(saved);
}

/** The saved folder as a vault source, or null when its sealed token does not open with this keyring for this account. */
export function openDropboxSource(ctx: { readonly settings: ConfiguredDropboxSettings; readonly fetch?: FetchFunction }, source: StoredDropboxSource): DropboxSource | null {
  const refreshToken = openDropboxRefreshToken(ctx.settings.keyring, source.userId, source.sealedCredentials);
  if (refreshToken === null) return null;
  const callOptions = ctx.fetch === undefined ? {} : { fetch: ctx.fetch };
  return createDropboxSource({ folder: source.folder, getAccessToken: () => refreshDropboxToken(toApp(ctx.settings), refreshToken, callOptions), ...callOptions });
}

/**
 * Revokes the grant behind a saved source, best effort: a refresh for an access token, then the revoke call. Answers
 * whether Dropbox confirmed it; the source is forgotten either way.
 */
export async function revokeDropboxSource(ctx: { readonly settings: ConfiguredDropboxSettings; readonly fetch?: FetchFunction }, source: StoredDropboxSource): Promise<boolean> {
  const refreshToken = openDropboxRefreshToken(ctx.settings.keyring, source.userId, source.sealedCredentials);
  if (refreshToken === null) return false;
  const callOptions = ctx.fetch === undefined ? {} : { fetch: ctx.fetch };
  const accessToken = await refreshDropboxToken(toApp(ctx.settings), refreshToken, callOptions);
  return accessToken.ok ? revokeDropboxToken(accessToken.value, callOptions) : false;
}

/** One of the link's codes, or null for anything else in a URL (so a crafted link cannot put text on the screen). */
export function readDropboxLinkError(value: unknown): DropboxLinkErrorCode | null {
  return typeof value === "string" && (DROPBOX_LINK_ERROR_CODES as readonly string[]).includes(value) ? (value as DropboxLinkErrorCode) : null;
}

/** Both read scopes and nothing that writes. */
function isReadOnlyGrant(scopes: readonly string[]): boolean {
  return DROPBOX_SCOPES.every((scope) => scopes.includes(scope)) && !scopes.some((scope) => scope.includes("write"));
}

function toApp(settings: ConfiguredDropboxSettings): DropboxAppCredentials {
  return { appKey: settings.appKey, appSecret: settings.appSecret };
}

function toCallOptions(ctx: DropboxLinkContext): { readonly fetch?: FetchFunction; readonly clock: Clock } {
  return { clock: ctx.clock, ...(ctx.fetch === undefined ? {} : { fetch: ctx.fetch }) };
}

function callbackUrl(ctx: DropboxLinkContext): string {
  return new URL(DROPBOX_CALLBACK_PATH, ctx.appOrigin).toString();
}

/** 32 random bytes, base64url (43 characters): a state or a PKCE verifier. */
function createRandomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createChallenge(verifier: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

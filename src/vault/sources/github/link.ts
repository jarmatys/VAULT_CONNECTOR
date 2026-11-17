// Linking an account to one repository through the product's GitHub App, and checking the link later.
//
// 1. `startGithubLink`: a one-time state (only its sha256 stored, bound to the account, ten minutes) and the App's
//    install page. The person installs the App on exactly one repository.
// 2. `continueGithubLink`: GitHub's setup redirect carries `installation_id` and the state. The id is only a claim
//    (anyone can type one into a URL), so it is recorded on the state and the browser goes on to the App's user
//    authorization (PKCE; instant for a person who signed in with GitHub).
// 3. `completeGithubLink`: the state is consumed; the user's own token must reach that installation (the proof it is
//    theirs), the installation must reach exactly one repository with contents read-only, and only then is the
//    source saved. The user token is used for that one call and dropped.
// `checkGithubSource` re-checks a saved link as the App: an uninstalled or suspended installation, or one that no
// longer reaches the repository, marks the source disconnected.
import { err, ok, type Clock, type FetchFunction, type Result } from "@softure-ai/core";
import {
  createGithubInstallationToken,
  exchangeGithubUserCode,
  getGithubAppInstallation,
  listGithubInstallationRepositories,
  listGithubUserInstallationRepositories,
  type GithubAppCredentials,
} from "@softure-ai/connections/github-app";
import type { Queryable } from "@softure-ai/db";
import { toSourceFailure, type SourceResult, type VaultSource } from "../source.ts";
import {
  attachInstallationToLinkState,
  consumeLinkState,
  createLinkState,
  recordSourceCheck,
  saveGithubSource,
  type StoredGithubSource,
} from "../store.ts";
import type { GithubSourceSettings } from "../../settings.ts";
import { createGithubSource } from "./github-source.ts";

/** Where GitHub sends the browser back; both are registered on the GitHub App (setup URL, callback URL). */
export const GITHUB_SETUP_PATH = "/panel/source/github/setup";
export const GITHUB_CALLBACK_PATH = "/panel/source/github/callback";

const LINK_STATE_TTL_MS = 10 * 60 * 1000;
/**
 * How often viewing the source re-checks it with GitHub. Each check spends three calls of the App's shared rate limit,
 * so reloading the screen must not spend more than this.
 */
export const SOURCE_CHECK_INTERVAL_MS = 60 * 1000;
/** auth's GitHub sign-in asks for these too; a GitHub App ignores scopes and grants its own permissions. */
const USER_SCOPES = "read:user user:email";

/** Why a link did not complete; the source screen names each. */
export type GithubLinkErrorCode =
  /** The state is unknown, expired, already used, or another account's. */
  | "vault.link_expired"
  /** The person declined the authorization on GitHub. */
  | "vault.link_denied"
  /** An organization owner has to approve the installation first. */
  | "vault.link_pending_approval"
  /** The person's GitHub account cannot reach that installation. */
  | "vault.link_not_yours"
  /** The installation reaches no repository, more than one, or every repository of the account. */
  | "vault.link_one_repository"
  /** The installation grants more than read access to contents, or none. */
  | "vault.link_permissions"
  /** GitHub did not answer, or answered something unreadable: try again. */
  | "vault.link_unavailable";

export type ConfiguredGithubSettings = Extract<GithubSourceSettings, { kind: "configured" }>;

export interface GithubLinkContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly settings: ConfiguredGithubSettings;
  /** The public origin the callback URL is built from (`APP_ORIGIN`), never a request header. */
  readonly appOrigin: string;
  readonly fetch?: FetchFunction;
  /**
   * Where the browser meets GitHub (the App's install page, the user authorization). Default `https://github.com`;
   * end-to-end tests point it at the fake GitHub (`<fake origin>/github.com`).
   */
  readonly webOrigin?: string;
}

const GITHUB_WEB_ORIGIN = "https://github.com";

/** Starts a link for the account and answers the App's install URL. */
export async function startGithubLink(ctx: GithubLinkContext, userId: string): Promise<URL> {
  const state = createRandomToken();
  const now = ctx.clock.now();
  await createLinkState(ctx.db, {
    userId,
    stateHash: await hashToken(state),
    codeVerifier: createRandomToken(),
    now,
    expiresAt: new Date(now.getTime() + LINK_STATE_TTL_MS),
  });
  const url = new URL(`${ctx.webOrigin ?? GITHUB_WEB_ORIGIN}/apps/${encodeURIComponent(ctx.settings.slug)}/installations/new`);
  url.searchParams.set("state", state);
  return url;
}

export interface GithubSetupParams {
  readonly state: string | null;
  readonly installationId: string | null;
  readonly setupAction: string | null;
}

/** The setup redirect: records the claimed installation on the account's state and answers the authorize URL. */
export async function continueGithubLink(ctx: GithubLinkContext, userId: string, params: GithubSetupParams): Promise<Result<URL, GithubLinkErrorCode>> {
  if (params.setupAction === "request") return err("vault.link_pending_approval");
  const installationId = parseId(params.installationId);
  if (params.state === null || installationId === null) return err("vault.link_expired");
  const stateHash = await hashToken(params.state);
  const verifier = await attachInstallationToLinkState(ctx.db, { userId, stateHash, installationId, now: ctx.clock.now() });
  if (verifier === null) return err("vault.link_expired");
  const url = new URL(`${ctx.webOrigin ?? GITHUB_WEB_ORIGIN}/login/oauth/authorize`);
  url.searchParams.set("client_id", ctx.settings.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(ctx));
  url.searchParams.set("scope", USER_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", await createChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return ok(url);
}

export interface GithubCallbackParams {
  readonly state: string | null;
  readonly code: string | null;
  readonly error: string | null;
}

/** The authorization callback: proves the installation is the account's, checks it, saves the source. */
export async function completeGithubLink(ctx: GithubLinkContext, userId: string, params: GithubCallbackParams): Promise<Result<StoredGithubSource, GithubLinkErrorCode>> {
  if (params.state === null) return err("vault.link_expired");
  const link = await consumeLinkState(ctx.db, { userId, stateHash: await hashToken(params.state), now: ctx.clock.now() });
  if (link === null) return err("vault.link_expired");
  if (params.error !== null || params.code === null) return err("vault.link_denied");

  const callOptions = ctx.fetch === undefined ? {} : { fetch: ctx.fetch };
  const userToken = await exchangeGithubUserCode(
    { clientId: ctx.settings.clientId, clientSecret: ctx.settings.clientSecret, code: params.code, redirectUri: callbackUrl(ctx), codeVerifier: link.codeVerifier },
    callOptions,
  );
  if (!userToken.ok) return err(userToken.error === "connections.github_app_rejected" ? "vault.link_denied" : "vault.link_unavailable");
  const reachable = await listGithubUserInstallationRepositories(userToken.value, link.installationId, callOptions);
  if (!reachable.ok) return err(reachable.error === "connections.github_app_not_found" ? "vault.link_not_yours" : "vault.link_unavailable");
  const [repository] = reachable.value.repositories;
  if (reachable.value.totalCount !== 1 || repository === undefined) return err("vault.link_one_repository");

  const installation = await getGithubAppInstallation(toCredentials(ctx.settings), link.installationId, callOptions);
  if (!installation.ok) return err(installation.error === "connections.github_app_not_found" ? "vault.link_not_yours" : "vault.link_unavailable");
  if (installation.value.repositorySelection !== "selected") return err("vault.link_one_repository");
  if (installation.value.permissions.contents !== "read") return err("vault.link_permissions");
  if (installation.value.isSuspended) return err("vault.link_not_yours");

  const saved = await saveGithubSource(ctx.db, {
    userId,
    installationId: link.installationId,
    repository: { id: repository.id, fullName: repository.fullName, defaultBranch: repository.defaultBranch },
    now: ctx.clock.now(),
  });
  return ok(saved);
}

/**
 * Checks a saved link as the App and records the outcome. A temporary failure at GitHub (an outage, a rate limit)
 * keeps the stored status and answers the source as it was.
 */
export async function checkGithubSource(ctx: GithubLinkContext, userId: string, source: StoredGithubSource): Promise<StoredGithubSource> {
  const outcome = await readLinkOutcome(ctx, source);
  if (outcome === "unknown") return source;
  const recorded = await recordSourceCheck(ctx.db, { userId, now: ctx.clock.now(), outcome });
  return recorded ?? source;
}

/** Whether a saved link is due for a check: its last check is at least `SOURCE_CHECK_INTERVAL_MS` old. */
export function isSourceCheckDue(source: StoredGithubSource, now: Date): boolean {
  return now.getTime() - source.checkedAt.getTime() >= SOURCE_CHECK_INTERVAL_MS;
}

/** The account's repository as a vault source, with a read-only token of that one repository minted per call. */
export function createAccountGithubSource(ctx: Pick<GithubLinkContext, "settings" | "fetch">, source: StoredGithubSource): VaultSource {
  const callOptions = ctx.fetch === undefined ? {} : { fetch: ctx.fetch };
  return createGithubSource({
    repository: { fullName: source.repositoryFullName, branch: source.defaultBranch },
    getToken: () => mintToken(ctx.settings, source, callOptions),
    ...callOptions,
  });
}

type LinkOutcome = { readonly kind: "connected"; readonly repository: { readonly id: number; readonly fullName: string; readonly defaultBranch: string } } | { readonly kind: "disconnected" } | "unknown";

async function readLinkOutcome(ctx: GithubLinkContext, source: StoredGithubSource): Promise<LinkOutcome> {
  const callOptions = ctx.fetch === undefined ? {} : { fetch: ctx.fetch };
  const installation = await getGithubAppInstallation(toCredentials(ctx.settings), source.installationId, callOptions);
  if (!installation.ok) return installation.error === "connections.github_app_not_found" ? { kind: "disconnected" } : "unknown";
  if (installation.value.isSuspended) return { kind: "disconnected" };
  const token = await mintToken(ctx.settings, source, callOptions);
  if (!token.ok) return token.error === "source.disconnected" ? { kind: "disconnected" } : "unknown";
  const repositories = await listGithubInstallationRepositories(token.value, callOptions);
  if (!repositories.ok) return repositories.error === "connections.github_app_rejected" || repositories.error === "connections.github_app_not_found" ? { kind: "disconnected" } : "unknown";
  const repository = repositories.value.repositories.find((candidate) => candidate.id === source.repositoryId);
  return repository === undefined ? { kind: "disconnected" } : { kind: "connected", repository };
}

/** A token of the one repository, contents read-only. A refusal (uninstalled, the repository unselected) is `disconnected`. */
async function mintToken(settings: ConfiguredGithubSettings, source: StoredGithubSource, callOptions: { readonly fetch?: FetchFunction }): Promise<SourceResult<string>> {
  const token = await createGithubInstallationToken(toCredentials(settings), source.installationId, {
    ...callOptions,
    repositoryIds: [source.repositoryId],
    permissions: { contents: "read" },
  });
  if (token.ok) return ok(token.value.token);
  switch (token.error) {
    case "connections.github_app_not_found":
    case "connections.github_app_rejected":
      return toSourceFailure("source.disconnected");
    case "connections.github_app_rate_limited":
      return toSourceFailure("source.rate_limited", token.retryAfterSeconds);
    case "connections.github_app_unavailable":
      return toSourceFailure("source.unavailable", token.retryAfterSeconds);
    case "connections.github_app_unexpected":
      // GitHub answers 422 when a repository id is no longer in the installation.
      return token.status === 422 ? toSourceFailure("source.disconnected") : toSourceFailure("source.unexpected");
    case "connections.github_app_key_invalid":
      return toSourceFailure("source.unexpected");
  }
}

function toCredentials(settings: ConfiguredGithubSettings): GithubAppCredentials {
  return { appId: settings.appId, privateKey: settings.privateKey };
}

function callbackUrl(ctx: GithubLinkContext): string {
  return new URL(GITHUB_CALLBACK_PATH, ctx.appOrigin).toString();
}

function parseId(value: string | null): number | null {
  if (value === null || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
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

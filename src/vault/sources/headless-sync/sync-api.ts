// The sync service's account API, as plain functions over core's HTTP helpers: sign-in (with a 2FA code when the
// account has one), sign-out, the list of the account's remote vaults, and the check of a vault key. The service answers
// a refusal as a 200 with an `error` field, so every call reads that first. The account's password and the session
// token travel only in request bodies, never in a URL, an error or a log.
import { ok, requestJson, type Clock, type FetchFunction, type HttpJsonFailure } from "@softure-ai/core";
import { z } from "zod";
import { toSourceFailure, type SourceErrorCode, type SourceResult } from "../source.ts";
import { isEncryptionVersion, SUPPORTED_ENCRYPTION_VERSION, type EncryptionVersion } from "./sync-crypto.ts";

export const SYNC_API_ORIGIN = "https://api.obsidian.md";
/** The service's own domain; a vault's socket host must be one of its subdomains. */
export const SYNC_SERVICE_DOMAIN = "obsidian.md";
/** The origin the service's sign-in expects; its own clients send it. */
const SIGN_IN_ORIGIN = "https://obsidian.md";

export interface SyncCallOptions {
  readonly fetch?: FetchFunction;
  readonly clock?: Clock;
}

export type SignInFailureCode =
  /** Email or password wrong. */
  | "vault.headless_sign_in_refused"
  /** The account has 2FA and the code was missing or wrong. */
  | "vault.headless_mfa_required"
  | "vault.headless_mfa_refused"
  | "vault.headless_unavailable";

const errorAnswer = z.object({ error: z.string().max(500) }).loose();
const signInAnswer = z.object({ token: z.string().min(16).max(512) }).loose();
const vaultEntry = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    host: z.string().min(1).max(253),
    salt: z.string().min(1).max(200),
    encryption_version: z.number().int(),
    password: z.string().max(1024).optional(),
  })
  .loose();
const vaultListAnswer = z.object({ vaults: z.array(vaultEntry).max(200), shared: z.array(vaultEntry).max(200).optional() }).loose();

/** A remote vault as the account's list names it; `managedPassword` only for standard encryption, never shown. */
export interface RemoteVault {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly salt: string;
  readonly encryptionVersion: EncryptionVersion;
  readonly encryption: "standard" | "e2ee";
  readonly managedPassword: string | null;
}

/** A session token, or why there is none. */
export async function signInToSync(
  input: { readonly email: string; readonly password: string; readonly mfaCode: string },
  options: SyncCallOptions = {},
): Promise<{ readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: SignInFailureCode }> {
  const answer = await postJson("/user/signin", { email: input.email, password: input.password, mfa: input.mfaCode }, options, { origin: SIGN_IN_ORIGIN });
  if (!answer.ok) return { ok: false, error: "vault.headless_unavailable" };
  const refused = errorAnswer.safeParse(answer.value);
  if (refused.success) {
    const message = refused.data.error.toLowerCase();
    if (message.includes("2fa")) return { ok: false, error: input.mfaCode === "" ? "vault.headless_mfa_required" : "vault.headless_mfa_refused" };
    return { ok: false, error: "vault.headless_sign_in_refused" };
  }
  const signedIn = signInAnswer.safeParse(answer.value);
  return signedIn.success ? { ok: true, value: signedIn.data.token } : { ok: false, error: "vault.headless_unavailable" };
}

/** Ends a session token. Best effort: the answer is not needed. */
export async function signOutOfSync(token: string, options: SyncCallOptions = {}): Promise<boolean> {
  const answer = await postJson("/user/signout", { token }, options);
  return answer.ok && !errorAnswer.safeParse(answer.value).success;
}

/** The account's vaults (its own, then those shared with it) that the adapter can read. */
export async function listRemoteVaults(token: string, options: SyncCallOptions = {}): Promise<SourceResult<readonly RemoteVault[]>> {
  const answer = await postJson("/vault/list", { token, supported_encryption_version: SUPPORTED_ENCRYPTION_VERSION }, options);
  if (!answer.ok) return answer;
  if (errorAnswer.safeParse(answer.value).success) return toSourceFailure("source.disconnected");
  const list = vaultListAnswer.safeParse(answer.value);
  if (!list.success) return toSourceFailure("source.unexpected");
  const vaults: RemoteVault[] = [];
  for (const entry of [...list.data.vaults, ...(list.data.shared ?? [])]) {
    if (!isEncryptionVersion(entry.encryption_version)) continue;
    const managed = entry.password !== undefined && entry.password !== "" ? entry.password : null;
    vaults.push({
      id: entry.id,
      name: entry.name,
      host: entry.host,
      salt: entry.salt,
      encryptionVersion: entry.encryption_version,
      encryption: managed === null ? "e2ee" : "standard",
      managedPassword: managed,
    });
  }
  return ok(vaults);
}

/** Whether the service accepts this key hash for the vault: `source.disconnected` when it refuses it. */
export async function checkVaultKey(token: string, vault: Pick<RemoteVault, "id" | "host" | "encryptionVersion">, keyHash: string, options: SyncCallOptions = {}): Promise<SourceResult<void>> {
  const answer = await postJson("/vault/access", { token, vault_uid: vault.id, keyhash: keyHash, host: vault.host, encryption_version: vault.encryptionVersion }, options);
  if (!answer.ok) return answer;
  return errorAnswer.safeParse(answer.value).success ? toSourceFailure("source.disconnected") : ok(undefined);
}

/**
 * Whether a socket host from the service's answer may be dialled: a subdomain of the service's domain (an optional
 * `:443`), or, only when `allowLoopback` (the end-to-end fake), a loopback host with a port.
 */
export function isAllowedSocketHost(host: string, allowLoopback = false): boolean {
  if (allowLoopback && /^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host)) return true;
  const match = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z0-9-]+\.[a-z]+)(:443)?$/i.exec(host);
  return match !== null && host.toLowerCase().replace(/:443$/, "").endsWith(`.${SYNC_SERVICE_DOMAIN}`);
}

async function postJson(path: string, body: Readonly<Record<string, unknown>>, options: SyncCallOptions, extra: { readonly origin?: string } = {}): Promise<SourceResult<unknown>> {
  const answer = await requestJson({
    url: `${SYNC_API_ORIGIN}${path}`,
    method: "POST",
    body,
    ...(extra.origin === undefined ? {} : { headers: { origin: extra.origin } }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
  return answer.ok ? ok(answer.value) : toApiFailure(answer);
}

function toApiFailure(answer: HttpJsonFailure): SourceResult<never> {
  return toSourceFailure(toApiCode(answer), "retryAfterSeconds" in answer ? answer.retryAfterSeconds : null);
}

function toApiCode(answer: HttpJsonFailure): SourceErrorCode {
  switch (answer.error) {
    case "core.http_refused":
      return answer.status === 401 || answer.status === 403 ? "source.disconnected" : "source.unexpected";
    case "core.http_rate_limited":
      return "source.rate_limited";
    case "core.http_unreachable":
    case "core.http_unavailable":
      return "source.unavailable";
    case "core.http_conflict":
    case "core.http_unexpected_answer":
      return "source.unexpected";
  }
}

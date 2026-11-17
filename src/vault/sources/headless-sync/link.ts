// Linking an account to one remote vault of its sync subscription, read-only, and opening it later.
//
// 1. `signInForLink`: the account signs in to the sync service with its email, password and, when it has one, a 2FA
//    code. The password goes to the service once and is never kept; the session token comes back and is held, sealed to
//    the account, in a short-lived cookie between this step and the next (`sealPendingToken`).
// 2. `listVaultsForLink`: the account's remote vaults, each with its encryption mode. A standard vault's password, which
//    the service hands to the signed-in account, is never shown.
// 3. `connectHeadlessSyncVault`: the vault the account picked, looked up again on the service (nothing about it is taken
//    from the browser but its id). A standard vault's key is derived here from the managed password; an end-to-end
//    vault's key is derived in the browser from the encryption password the account types, so that password never
//    reaches this server, and only the key arrives. The key is checked with the service and with one session on the
//    vault's socket before anything is stored; then the token and the key are sealed together and the source saved.
// `openHeadlessSyncSource` turns a saved source into the vault source the sync reads; `signOutHeadlessSyncSource` ends
// the session when the account disconnects.
import { err, ok, type Clock, type FetchFunction, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { openSecret, sealSecret } from "@softure-ai/connections/server";
import { z } from "zod";
import type { HeadlessSyncSourceSettings } from "../../settings.ts";
import { saveHeadlessSyncSource, type StoredHeadlessSyncSource } from "../store.ts";
import { openHeadlessSyncCredentials, sealHeadlessSyncCredentials } from "./headless-sync-credentials.ts";
import { createHeadlessSyncSource, type HeadlessSyncSource } from "./headless-sync-source.ts";
import { checkVaultKey, isAllowedSocketHost, listRemoteVaults, signInToSync, signOutOfSync, type RemoteVault, type SignInFailureCode, type SyncCallOptions } from "./sync-api.ts";
import { createVaultCipher, deriveVaultKey, fromHex, VAULT_KEY_BYTES } from "./sync-crypto.ts";
import { createHeadlessSyncFakeFetch } from "./sync-fetch.ts";
import type { SyncSocketFactory } from "./sync-socket.ts";

/** How long a signed-in, not yet connected session is held for the account: the time to pick a vault. */
export const PENDING_TOKEN_TTL_MS = 10 * 60 * 1000;

export type HeadlessSyncLinkErrorCode =
  | SignInFailureCode
  /** The email, password or code is missing or too long. */
  | "vault.headless_sign_in_invalid"
  /** The held session is gone (expired, signed out, another account's): sign in again. */
  | "vault.headless_link_expired"
  /** The picked vault is not in the account's list any more. */
  | "vault.headless_vault_not_found"
  /** The service names a socket host this instance does not dial. */
  | "vault.headless_vault_unsupported"
  /** An end-to-end vault needs its key, and none (or a malformed one) came from the browser. */
  | "vault.headless_key_missing"
  /** The service refused the key: the encryption password was wrong. */
  | "vault.headless_key_refused";

export const HEADLESS_SYNC_LINK_ERROR_CODES: readonly HeadlessSyncLinkErrorCode[] = [
  "vault.headless_sign_in_invalid",
  "vault.headless_sign_in_refused",
  "vault.headless_mfa_required",
  "vault.headless_mfa_refused",
  "vault.headless_unavailable",
  "vault.headless_link_expired",
  "vault.headless_vault_not_found",
  "vault.headless_vault_unsupported",
  "vault.headless_key_missing",
  "vault.headless_key_refused",
];

export type ConfiguredHeadlessSyncSettings = Extract<HeadlessSyncSourceSettings, { kind: "configured" }>;

export interface HeadlessSyncLinkContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly settings: ConfiguredHeadlessSyncSettings;
  /** A fake account API in unit tests; end-to-end tests set `settings.fakeOrigin` instead. */
  readonly fetch?: FetchFunction;
  /** A fake socket in unit tests. */
  readonly socketFactory?: SyncSocketFactory;
  /** Milliseconds to wait for each socket answer. */
  readonly timeoutMs?: number;
}

/** A remote vault as the panel lists it: nothing secret. */
export interface LinkableVault {
  readonly id: string;
  readonly name: string;
  readonly encryption: "standard" | "e2ee";
  readonly encryptionVersion: number;
  /** Needed by the browser to derive an end-to-end vault's key. */
  readonly salt: string;
  /** Whether this instance can dial the vault's socket. */
  readonly isSupported: boolean;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly mfaCode: string;
}

/** Signs in to the sync service and answers the session token, or why there is none. */
export async function signInForLink(ctx: HeadlessSyncLinkContext, input: SignInInput): Promise<Result<string, HeadlessSyncLinkErrorCode>> {
  const email = input.email.trim();
  const mfaCode = input.mfaCode.trim();
  if (email === "" || email.length > 320 || input.password === "" || input.password.length > 1024 || !/^\d{0,10}$/.test(mfaCode)) {
    return err("vault.headless_sign_in_invalid");
  }
  const signedIn = await signInToSync({ email, password: input.password, mfaCode }, toCallOptions(ctx));
  return signedIn.ok ? ok(signedIn.value) : err(signedIn.error);
}

/** The account's remote vaults, or why they cannot be listed (`vault.headless_link_expired` for a refused token). */
export async function listVaultsForLink(ctx: HeadlessSyncLinkContext, token: string): Promise<Result<readonly LinkableVault[], HeadlessSyncLinkErrorCode>> {
  const listed = await listRemoteVaults(token, toCallOptions(ctx));
  if (!listed.ok) return err(listed.error === "source.disconnected" ? "vault.headless_link_expired" : "vault.headless_unavailable");
  return ok(
    listed.value.map((vault) => ({
      id: vault.id,
      name: vault.name,
      encryption: vault.encryption,
      encryptionVersion: vault.encryptionVersion,
      salt: vault.salt,
      isSupported: isAllowedSocketHost(vault.host, isLoopbackAllowed(ctx)),
    })),
  );
}

export interface ConnectVaultInput {
  readonly token: string;
  readonly vaultId: string;
  /** Hex of the 32-byte key the browser derived; only for an end-to-end vault, ignored for a standard one. */
  readonly keyHex: string | null;
}

/** Checks the key with the service and the vault's socket, then seals the token and the key and saves the source. */
export async function connectHeadlessSyncVault(ctx: HeadlessSyncLinkContext, userId: string, input: ConnectVaultInput): Promise<Result<StoredHeadlessSyncSource, HeadlessSyncLinkErrorCode>> {
  const callOptions = toCallOptions(ctx);
  const listed = await listRemoteVaults(input.token, callOptions);
  if (!listed.ok) return err(listed.error === "source.disconnected" ? "vault.headless_link_expired" : "vault.headless_unavailable");
  const vault = listed.value.find((candidate) => candidate.id === input.vaultId);
  if (vault === undefined) return err("vault.headless_vault_not_found");
  if (!isAllowedSocketHost(vault.host, isLoopbackAllowed(ctx))) return err("vault.headless_vault_unsupported");

  const key = await readVaultKey(vault, input.keyHex);
  if (key === null) return err("vault.headless_key_missing");
  const cipher = await createVaultCipher(key, vault.salt, vault.encryptionVersion);
  const checked = await checkVaultKey(input.token, vault, cipher.keyHash, callOptions);
  if (!checked.ok) {
    // The service answers a refused key and a refused token alike; the token was just accepted by the list above.
    return err(checked.error === "source.disconnected" ? "vault.headless_key_refused" : "vault.headless_unavailable");
  }
  const probe = await createAdapter(ctx, { vault, token: input.token, key }).probe();
  if (!probe.ok) return err(probe.error === "source.disconnected" ? "vault.headless_key_refused" : "vault.headless_unavailable");

  const saved = await saveHeadlessSyncSource(ctx.db, {
    userId,
    vault: { id: vault.id, name: vault.name, host: vault.host, salt: vault.salt, encryption: vault.encryption, encryptionVersion: vault.encryptionVersion },
    sealedCredentials: sealHeadlessSyncCredentials(ctx.settings.keyring, userId, { token: input.token, key }),
    now: ctx.clock.now(),
  });
  return ok(saved);
}

/** The saved vault as a vault source, or null when its sealed session does not open or its host is not dialled. */
export function openHeadlessSyncSource(
  ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly socketFactory?: SyncSocketFactory; readonly timeoutMs?: number },
  source: StoredHeadlessSyncSource,
): HeadlessSyncSource | null {
  const credentials = openHeadlessSyncCredentials(ctx.settings.keyring, source.userId, source.sealedCredentials);
  if (credentials === null) return null;
  if (!isAllowedSocketHost(source.host, isLoopbackAllowed(ctx))) return null;
  return createAdapter(ctx, { vault: { id: source.vaultId, host: source.host, salt: source.salt, encryptionVersion: source.encryptionVersion }, ...credentials });
}

/** Ends the saved session at the service, best effort; answers whether the service confirmed it. */
export async function signOutHeadlessSyncSource(ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly fetch?: FetchFunction }, source: StoredHeadlessSyncSource): Promise<boolean> {
  const credentials = openHeadlessSyncCredentials(ctx.settings.keyring, source.userId, source.sealedCredentials);
  if (credentials === null) return false;
  return signOutOfSync(credentials.token, toCallOptions(ctx));
}

/** Ends a held, never connected session (the account went back, or picked nothing), best effort. */
export async function signOutPendingToken(ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly fetch?: FetchFunction }, token: string): Promise<boolean> {
  return signOutOfSync(token, toCallOptions(ctx));
}

const pendingShape = z.object({ token: z.string().min(1).max(512), issuedAt: z.number().int().nonnegative() }).strict();

/** The session token sealed to the account with its moment, for the cookie between sign-in and the pick. */
export function sealPendingToken(ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly clock: Clock }, userId: string, token: string): string {
  return sealSecret(ctx.settings.keyring, JSON.stringify({ token, issuedAt: ctx.clock.now().getTime() }), toPendingContext(userId)).sealed;
}

/** The held session token, or null when the value does not open for this account, is malformed or has expired. */
export function openPendingToken(ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly clock: Clock }, userId: string, sealed: string | undefined): string | null {
  if (sealed === undefined || sealed === "" || sealed.length > 4000) return null;
  const opened = openSecret(ctx.settings.keyring, sealed, toPendingContext(userId));
  if (!opened.ok) return null;
  let value: unknown;
  try {
    value = JSON.parse(opened.value);
  } catch {
    return null;
  }
  const parsed = pendingShape.safeParse(value);
  if (!parsed.success) return null;
  const age = ctx.clock.now().getTime() - parsed.data.issuedAt;
  return age >= 0 && age <= PENDING_TOKEN_TTL_MS ? parsed.data.token : null;
}

/** One of the link's codes, or null for anything else in a URL (so a crafted link cannot put text on the screen). */
export function readHeadlessSyncLinkError(value: unknown): HeadlessSyncLinkErrorCode | null {
  return typeof value === "string" && (HEADLESS_SYNC_LINK_ERROR_CODES as readonly string[]).includes(value) ? (value as HeadlessSyncLinkErrorCode) : null;
}

/** A standard vault's key from its managed password; an end-to-end vault's from the browser's hex. */
async function readVaultKey(vault: RemoteVault, keyHex: string | null): Promise<Uint8Array | null> {
  if (vault.encryption === "standard" && vault.managedPassword !== null) return deriveVaultKey(vault.managedPassword, vault.salt);
  if (keyHex === null) return null;
  const key = fromHex(keyHex.trim().toLowerCase());
  return key !== null && key.byteLength === VAULT_KEY_BYTES ? key : null;
}

function createAdapter(
  ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly socketFactory?: SyncSocketFactory; readonly timeoutMs?: number },
  input: { readonly vault: Pick<RemoteVault, "id" | "host" | "salt" | "encryptionVersion">; readonly token: string; readonly key: Uint8Array },
): HeadlessSyncSource {
  return createHeadlessSyncSource({
    vault: { id: input.vault.id, host: input.vault.host, salt: input.vault.salt, encryptionVersion: input.vault.encryptionVersion },
    token: input.token,
    key: input.key,
    allowLoopback: isLoopbackAllowed(ctx),
    ...(ctx.socketFactory === undefined ? {} : { socketFactory: ctx.socketFactory }),
    ...(ctx.timeoutMs === undefined ? {} : { timeoutMs: ctx.timeoutMs }),
  });
}

function isLoopbackAllowed(ctx: { readonly settings: ConfiguredHeadlessSyncSettings }): boolean {
  return ctx.settings.fakeOrigin !== undefined;
}

function toCallOptions(ctx: { readonly settings: ConfiguredHeadlessSyncSettings; readonly fetch?: FetchFunction; readonly clock?: Clock }): SyncCallOptions {
  const fetch = ctx.fetch ?? (ctx.settings.fakeOrigin === undefined ? undefined : createHeadlessSyncFakeFetch(ctx.settings.fakeOrigin));
  return { ...(fetch === undefined ? {} : { fetch }), ...(ctx.clock === undefined ? {} : { clock: ctx.clock }) };
}

function toPendingContext(userId: string): string {
  return `vault/sources/${userId}/headless-sync-pending`;
}

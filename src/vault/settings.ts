// The environment settings of the git source: the GitHub App the product installs on an account's repository. The
// App's client id and secret are the sign-in's (`GH_AUTH_CLIENT_ID`, `GH_AUTH_CLIENT_SECRET`: one App for both,
// decision of account-signs-up-to-panel); the source adds its id, its URL name and its private key. An instance
// without them (self-hosted without GitHub) shows no connect button, only that the git source is not configured.
import { GITHUB_CLIENT_ID_ENV, GITHUB_CLIENT_SECRET_ENV, toLoopbackOrigin } from "../account-settings.ts";
import { readSourceKeyring, type SourceKeyring } from "./sources/s3/s3-credentials.ts";

/** `1` lets an S3 endpoint be `http` or on a private or loopback address: a self-hosted bucket on its own network. */
export const S3_ALLOW_PRIVATE_ENDPOINTS_ENV = "VAULT_S3_ALLOW_PRIVATE_ENDPOINTS";

export const GITHUB_APP_ID_ENV = "GH_APP_ID";
export const GITHUB_APP_SLUG_ENV = "GH_APP_SLUG";
export const GITHUB_APP_PRIVATE_KEY_ENV = "GH_APP_PRIVATE_KEY";

/** GitHub's rule for an App's URL name: letters, digits and single hyphens. */
const APP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export type GithubSourceSettings =
  | {
      readonly kind: "configured";
      readonly appId: string;
      /** `https://github.com/apps/<slug>`. */
      readonly slug: string;
      /** PEM, as GitHub hands it out (PKCS#1); never logged. */
      readonly privateKey: string;
      readonly clientId: string;
      readonly clientSecret: string;
    }
  | { readonly kind: "unconfigured" };

type Environment = Readonly<Record<string, string | undefined>>;

/** The GitHub App of the git source when all five values are set and well formed; otherwise unconfigured. */
export function readGithubSourceSettings(env: Environment): GithubSourceSettings {
  const appId = readNonEmpty(env[GITHUB_APP_ID_ENV]);
  const slug = readNonEmpty(env[GITHUB_APP_SLUG_ENV]);
  const privateKey = readNonEmpty(env[GITHUB_APP_PRIVATE_KEY_ENV]);
  const clientId = readNonEmpty(env[GITHUB_CLIENT_ID_ENV]);
  const clientSecret = readNonEmpty(env[GITHUB_CLIENT_SECRET_ENV]);
  if (appId === undefined || slug === undefined || privateKey === undefined || clientId === undefined || clientSecret === undefined) {
    return { kind: "unconfigured" };
  }
  if (!/^\d+$/.test(appId) || !APP_SLUG.test(slug)) return { kind: "unconfigured" };
  return { kind: "configured", appId, slug, privateKey, clientId, clientSecret };
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * The S3 source: configured when the vault's keyring is set (`VAULT_SOURCE_KEYS`), since a key pair is only ever stored
 * sealed. Without it the panel offers no S3 form and an S3 source is not read.
 */
export type S3SourceSettings =
  | { readonly kind: "configured"; readonly keyring: SourceKeyring; readonly allowPrivateEndpoints: boolean }
  | { readonly kind: "unconfigured" };

export const DROPBOX_APP_KEY_ENV = "DROPBOX_APP_KEY";
export const DROPBOX_APP_SECRET_ENV = "DROPBOX_APP_SECRET";
/** A loopback stand-in for Dropbox (end-to-end tests): its API, content and consent hosts under one origin. */
export const DROPBOX_FAKE_ORIGIN_ENV = "DROPBOX_FAKE_ORIGIN";

/**
 * The Dropbox source: configured when the product's Dropbox app (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`) and the
 * vault's keyring are set, since a refresh token is only ever stored sealed. Without them the panel offers no Dropbox
 * connect and a Dropbox source is not read.
 */
export type DropboxSourceSettings =
  | { readonly kind: "configured"; readonly appKey: string; readonly appSecret: string; readonly keyring: SourceKeyring }
  | { readonly kind: "unconfigured" };

/** Dropbox app keys are short lower-case letters and digits. */
const DROPBOX_APP_KEY = /^[a-z0-9-]{1,64}$/i;

export function readDropboxSourceSettings(env: Environment): DropboxSourceSettings {
  const appKey = readNonEmpty(env[DROPBOX_APP_KEY_ENV]);
  const appSecret = readNonEmpty(env[DROPBOX_APP_SECRET_ENV]);
  const keyring = readSourceKeyring(env);
  if (appKey === undefined || appSecret === undefined || keyring === null || !DROPBOX_APP_KEY.test(appKey)) return { kind: "unconfigured" };
  return { kind: "configured", appKey, appSecret, keyring };
}

/** The Dropbox fake's origin in end-to-end tests; only a loopback http(s) origin is accepted. */
export function readDropboxFakeOrigin(env: Environment): string | undefined {
  return toLoopbackOrigin(readNonEmpty(env[DROPBOX_FAKE_ORIGIN_ENV]));
}

export function readS3SourceSettings(env: Environment): S3SourceSettings {
  const keyring = readSourceKeyring(env);
  if (keyring === null) return { kind: "unconfigured" };
  return { kind: "configured", keyring, allowPrivateEndpoints: env[S3_ALLOW_PRIVATE_ENDPOINTS_ENV]?.trim() === "1" };
}

/** A loopback stand-in for the sync service (end-to-end tests): its account API, and a socket host on loopback. */
export const HEADLESS_SYNC_FAKE_ORIGIN_ENV = "HEADLESS_SYNC_FAKE_ORIGIN";

/**
 * The headless sync source (a remote vault of the account's sync subscription): configured when the vault's keyring is
 * set, since the session token and the vault key are only ever stored sealed. Needs no app of the product's own.
 * `fakeOrigin` (end-to-end tests only, loopback only) sends the account API to the fake and lets the socket dial
 * loopback.
 */
export type HeadlessSyncSourceSettings =
  | { readonly kind: "configured"; readonly keyring: SourceKeyring; readonly fakeOrigin: string | undefined }
  | { readonly kind: "unconfigured" };

export function readHeadlessSyncSourceSettings(env: Environment): HeadlessSyncSourceSettings {
  const keyring = readSourceKeyring(env);
  if (keyring === null) return { kind: "unconfigured" };
  return { kind: "configured", keyring, fakeOrigin: toLoopbackOrigin(readNonEmpty(env[HEADLESS_SYNC_FAKE_ORIGIN_ENV])) };
}

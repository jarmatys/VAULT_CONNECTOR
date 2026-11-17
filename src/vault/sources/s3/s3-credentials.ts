// The S3 key pair at rest: sealed with AES-256-GCM under the vault's keyring (`VAULT_SOURCE_KEYS`, the format of
// `@softure-ai/connections`: `<id>:<base64 of 32 bytes>[,<id>:<key>…]`, made with `npx softure-connections key`), bound
// to the account it belongs to, so a value copied to another account's row does not open. The first key seals, every
// key opens: rotate by putting a new key first, then let accounts re-enter keys or re-seal. Neither a key nor a secret
// ever reaches a log, an error or the browser.
import { CONNECTIONS_KEYS_ENV, openSecret, readKeyring, sealSecret, type Keyring } from "@softure-ai/connections/server";
import type { SigV4Credentials } from "@softure-ai/files/server";
import { z } from "zod";

export const VAULT_SOURCE_KEYS_ENV = "VAULT_SOURCE_KEYS";

export type { Keyring as SourceKeyring };

/** The keyring from the environment, or null when it is missing or malformed (the S3 source is then unconfigured). */
export function readSourceKeyring(env: Readonly<Record<string, string | undefined>>): Keyring | null {
  const keyring = readKeyring({ [CONNECTIONS_KEYS_ENV]: env[VAULT_SOURCE_KEYS_ENV] });
  return keyring.ok ? keyring.value : null;
}

const credentialsSchema = z.object({ accessKeyId: z.string().min(1).max(128), secretAccessKey: z.string().min(1).max(256) });

export function sealS3Credentials(keyring: Keyring, userId: string, credentials: SigV4Credentials): string {
  return sealSecret(keyring, JSON.stringify({ accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey }), toContext(userId)).sealed;
}

/** The key pair, or null when the value does not open for this account with this keyring. */
export function openS3Credentials(keyring: Keyring, userId: string, sealed: string): SigV4Credentials | null {
  const opened = openSecret(keyring, sealed, toContext(userId));
  if (!opened.ok) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(opened.value);
  } catch {
    return null;
  }
  const credentials = credentialsSchema.safeParse(parsed);
  return credentials.success ? credentials.data : null;
}

function toContext(userId: string): string {
  return `vault/sources/${userId}/s3`;
}

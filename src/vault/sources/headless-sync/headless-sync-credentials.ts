// The sync session at rest: the account's session token and the vault key, sealed together with AES-256-GCM under the
// vault's keyring (`VAULT_SOURCE_KEYS`, the same keyring as S3 key pairs and Dropbox tokens), bound to the account, so a
// value copied to another account's row does not open. The vault's encryption password is never part of it: only the
// key derived from it, which reads this one vault and nothing else. Neither value reaches a log, an error or the browser.
import { openSecret, sealSecret, type Keyring } from "@softure-ai/connections/server";
import { z } from "zod";
import { fromHex, toHex, VAULT_KEY_BYTES } from "./sync-crypto.ts";

export interface HeadlessSyncCredentials {
  readonly token: string;
  /** The vault key (32 bytes). */
  readonly key: Uint8Array;
}

const sealedShape = z.object({ token: z.string().min(1).max(512), key: z.string().regex(/^[0-9a-f]+$/) }).strict();

export function sealHeadlessSyncCredentials(keyring: Keyring, userId: string, credentials: HeadlessSyncCredentials): string {
  return sealSecret(keyring, JSON.stringify({ token: credentials.token, key: toHex(credentials.key) }), toContext(userId)).sealed;
}

/** The token and the key, or null when the value does not open for this account with this keyring. */
export function openHeadlessSyncCredentials(keyring: Keyring, userId: string, sealed: string): HeadlessSyncCredentials | null {
  const opened = openSecret(keyring, sealed, toContext(userId));
  if (!opened.ok) return null;
  let value: unknown;
  try {
    value = JSON.parse(opened.value);
  } catch {
    return null;
  }
  const parsed = sealedShape.safeParse(value);
  if (!parsed.success) return null;
  const key = fromHex(parsed.data.key);
  if (key === null || key.byteLength !== VAULT_KEY_BYTES) return null;
  return { token: parsed.data.token, key };
}

function toContext(userId: string): string {
  return `vault/sources/${userId}/headless-sync`;
}

// The Dropbox refresh token at rest: sealed with AES-256-GCM under the vault's keyring (`VAULT_SOURCE_KEYS`, the same
// keyring as S3 key pairs), bound to the account it belongs to, so a value copied to another account's row does not
// open. The token never reaches a log, an error or the browser.
import { openSecret, sealSecret, type Keyring } from "@softure-ai/connections/server";

const MAX_TOKEN_LENGTH = 4096;

export function sealDropboxRefreshToken(keyring: Keyring, userId: string, refreshToken: string): string {
  return sealSecret(keyring, refreshToken, toContext(userId)).sealed;
}

/** The refresh token, or null when the value does not open for this account with this keyring. */
export function openDropboxRefreshToken(keyring: Keyring, userId: string, sealed: string): string | null {
  const opened = openSecret(keyring, sealed, toContext(userId));
  if (!opened.ok || opened.value === "" || opened.value.length > MAX_TOKEN_LENGTH) return null;
  return opened.value;
}

function toContext(userId: string): string {
  return `vault/sources/${userId}/dropbox`;
}

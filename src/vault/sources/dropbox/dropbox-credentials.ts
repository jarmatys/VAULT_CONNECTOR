// The Dropbox refresh token at rest: sealed by `@softure-ai/connections/user-oauth` under the vault's keyring
// (`VAULT_SOURCE_KEYS`, the same keyring as S3 key pairs), bound to the account and the provider, so a value copied to
// another account's row does not open. The token never reaches a log, an error or the browser.
import type { Keyring } from "@softure-ai/connections/server";
import { openUserSecret, sealUserSecret, type UserSecretOwner } from "@softure-ai/connections/user-oauth";

const MAX_TOKEN_LENGTH = 4096;

export function sealDropboxRefreshToken(keyring: Keyring, userId: string, refreshToken: string): string {
  return sealUserSecret(keyring, toOwner(userId), refreshToken);
}

/** The refresh token, or null when the value does not open for this account with this keyring. */
export function openDropboxRefreshToken(keyring: Keyring, userId: string, sealed: string): string | null {
  const opened = openUserSecret(keyring, toOwner(userId), sealed);
  if (!opened.ok || opened.value.length > MAX_TOKEN_LENGTH) return null;
  return opened.value;
}

function toOwner(userId: string): UserSecretOwner {
  return { userId, provider: "dropbox" };
}

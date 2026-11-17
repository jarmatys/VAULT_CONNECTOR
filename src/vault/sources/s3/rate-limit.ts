// Connecting a bucket calls an address the account typed, so attempts are counted per account: enough to fix a typo
// or two, too few to use the server as a scanner of other hosts.
export const S3_CONNECT_RATE_LIMIT_BUCKET = "vault-s3-connect";

// Signing in to the sync service sends the account's email and password to it: counted per account, so the panel
// cannot be used to guess a sync account's password, and the service never sees a burst from this server.
export const HEADLESS_SYNC_CONNECT_RATE_LIMIT_BUCKET = "vault-headless-sync-connect";

export const VAULT_RATE_LIMIT_BUCKETS = {
  [S3_CONNECT_RATE_LIMIT_BUCKET]: { limit: 10, windowMinutes: 15, key: "account" },
  [HEADLESS_SYNC_CONNECT_RATE_LIMIT_BUCKET]: { limit: 10, windowMinutes: 15, key: "account" },
} as const;

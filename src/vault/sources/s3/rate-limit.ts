// Connecting a bucket calls an address the account typed, so attempts are counted per account: enough to fix a typo
// or two, too few to use the server as a scanner of other hosts.
export const S3_CONNECT_RATE_LIMIT_BUCKET = "vault-s3-connect";

export const VAULT_RATE_LIMIT_BUCKETS = {
  [S3_CONNECT_RATE_LIMIT_BUCKET]: { limit: 10, windowMinutes: 15, key: "account" },
} as const;

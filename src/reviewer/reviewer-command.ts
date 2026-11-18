// The arguments and the environment of `npm run reviewer`: create the reviewer's account (`--email=<address>`,
// `--days=<n>`) against the bucket named by the REVIEWER_VAULT_* variables, or remove it (`--remove --email=<address>`).
import type { S3ConnectInput } from "../vault/sources/s3/connect.ts";
import { REVIEWER_DEFAULT_DAYS } from "./reviewer-account.ts";

export const REVIEWER_USAGE = "usage: npm run reviewer -- --email=<address> [--days=<1..60>] | --remove --email=<address>";

export const REVIEWER_VAULT_ENV = {
  endpoint: "REVIEWER_VAULT_ENDPOINT",
  region: "REVIEWER_VAULT_REGION",
  bucket: "REVIEWER_VAULT_BUCKET",
  prefix: "REVIEWER_VAULT_PREFIX",
  accessKeyId: "REVIEWER_VAULT_ACCESS_KEY_ID",
  secretAccessKey: "REVIEWER_VAULT_SECRET_ACCESS_KEY",
} as const;

export type ReviewerCommand =
  | { readonly kind: "create"; readonly email: string; readonly days: number }
  | { readonly kind: "remove"; readonly email: string };

/** The command, or null for arguments it does not take (the caller prints the usage). */
export function parseReviewerArgs(argv: readonly string[]): ReviewerCommand | null {
  let email: string | null = null;
  let days: number | null = null;
  let isRemoval = false;
  for (const argument of argv) {
    const emailMatch = /^--email=(.+)$/.exec(argument);
    const daysMatch = /^--days=(\d{1,3})$/.exec(argument);
    if (emailMatch !== null && email === null) email = emailMatch[1] ?? null;
    else if (daysMatch !== null && days === null) days = Number(daysMatch[1]);
    else if (argument === "--remove" && !isRemoval) isRemoval = true;
    else return null;
  }
  if (email === null || !email.includes("@")) return null;
  if (isRemoval) return days === null ? { kind: "remove", email } : null;
  return { kind: "create", email, days: days ?? REVIEWER_DEFAULT_DAYS };
}

/** The fixture bucket from the environment, or the names of the variables that are missing. */
export function readReviewerVault(env: Readonly<Record<string, string | undefined>>): { readonly ok: true; readonly value: S3ConnectInput } | { readonly ok: false; readonly missing: string[] } {
  const read = (name: string) => env[name]?.trim() ?? "";
  const required = [REVIEWER_VAULT_ENV.endpoint, REVIEWER_VAULT_ENV.bucket, REVIEWER_VAULT_ENV.accessKeyId, REVIEWER_VAULT_ENV.secretAccessKey];
  const missing = required.filter((name) => read(name) === "");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    value: {
      endpoint: read(REVIEWER_VAULT_ENV.endpoint),
      region: read(REVIEWER_VAULT_ENV.region),
      bucket: read(REVIEWER_VAULT_ENV.bucket),
      prefix: read(REVIEWER_VAULT_ENV.prefix),
      accessKeyId: read(REVIEWER_VAULT_ENV.accessKeyId),
      secretAccessKey: read(REVIEWER_VAULT_ENV.secretAccessKey),
    },
  };
}

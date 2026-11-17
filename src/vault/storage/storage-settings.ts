// Where the synced copies of notes live and the secret their keys are derived from. Hosted: an R2 bucket through its
// S3 API (endpoint, bucket and a token that may read and write it). Self-hosted: the same, or a folder on a volume.
// Without a store and a secret the sync is not configured: nothing is enqueued and the panel can say so.
import type { FileStorage } from "@softure-ai/files";
import { createLocalStorage, createS3Storage } from "@softure-ai/files/server";

export const VAULT_S3_ENDPOINT_ENV = "VAULT_S3_ENDPOINT";
export const VAULT_S3_BUCKET_ENV = "VAULT_S3_BUCKET";
export const VAULT_S3_REGION_ENV = "VAULT_S3_REGION";
export const VAULT_S3_ACCESS_KEY_ID_ENV = "VAULT_S3_ACCESS_KEY_ID";
export const VAULT_S3_SECRET_ACCESS_KEY_ENV = "VAULT_S3_SECRET_ACCESS_KEY";
export const VAULT_STORAGE_DIR_ENV = "VAULT_STORAGE_DIR";
export const VAULT_STORAGE_KEY_SECRET_ENV = "VAULT_STORAGE_KEY_SECRET";

/** The shortest key secret accepted: 32 characters (`openssl rand -hex 32` gives 64). */
export const MIN_KEY_SECRET_LENGTH = 32;

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export type VaultStorageLocation =
  | { readonly kind: "s3"; readonly endpoint: string; readonly bucket: string; readonly region: string }
  | { readonly kind: "local"; readonly dir: string };

export type VaultStorageSettings =
  | { readonly kind: "configured"; readonly location: VaultStorageLocation; readonly keySecret: string }
  | { readonly kind: "unconfigured" };

type Environment = Readonly<Record<string, string | undefined>>;

/** The store and the key secret when both are set and well formed; otherwise unconfigured. */
export function readVaultStorageSettings(env: Environment): VaultStorageSettings {
  const keySecret = readNonEmpty(env[VAULT_STORAGE_KEY_SECRET_ENV]);
  if (keySecret === undefined || keySecret.length < MIN_KEY_SECRET_LENGTH) return { kind: "unconfigured" };
  const location = readLocation(env);
  return location === undefined ? { kind: "unconfigured" } : { kind: "configured", location, keySecret };
}

function readLocation(env: Environment): VaultStorageLocation | undefined {
  const endpoint = readNonEmpty(env[VAULT_S3_ENDPOINT_ENV]);
  const bucket = readNonEmpty(env[VAULT_S3_BUCKET_ENV]);
  if (endpoint !== undefined || bucket !== undefined) {
    if (endpoint === undefined || bucket === undefined || !BUCKET.test(bucket) || !isHttpUrl(endpoint)) return undefined;
    if (readNonEmpty(env[VAULT_S3_ACCESS_KEY_ID_ENV]) === undefined || readNonEmpty(env[VAULT_S3_SECRET_ACCESS_KEY_ENV]) === undefined) return undefined;
    return { kind: "s3", endpoint, bucket, region: readNonEmpty(env[VAULT_S3_REGION_ENV]) ?? "auto" };
  }
  const dir = readNonEmpty(env[VAULT_STORAGE_DIR_ENV]);
  return dir === undefined ? undefined : { kind: "local", dir };
}

/** The driver for a location. Building it touches neither the network nor the disk. */
export function createVaultStorage(location: VaultStorageLocation): FileStorage {
  if (location.kind === "local") return createLocalStorage({ dir: location.dir });
  return createS3Storage({
    endpoint: location.endpoint,
    bucket: location.bucket,
    region: location.region,
    accessKeyIdEnv: VAULT_S3_ACCESS_KEY_ID_ENV,
    secretAccessKeyEnv: VAULT_S3_SECRET_ACCESS_KEY_ENV,
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

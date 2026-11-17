// Connecting an account to an S3-compatible bucket: the location is checked (`s3-location.ts`), the key pair is tried
// with one listing call before anything is stored, then sealed and saved as the account's source. Nothing is written
// to the bucket, ever; the form asks for a read-only key, and the product only lists and reads.
import { err, ok, type Clock, type FetchFunction, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { S3SourceSettings } from "../../settings.ts";
import type { SourceErrorCode } from "../source.ts";
import { saveS3Source, type StoredS3Source } from "../store.ts";
import { sealS3Credentials } from "./s3-credentials.ts";
import { parseS3Location, type S3LocationErrorCode } from "./s3-location.ts";
import { createS3Source } from "./s3-source.ts";

export interface S3ConnectInput {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type S3ConnectErrorCode =
  | S3LocationErrorCode
  /** This instance has no vault keyring, so a key pair cannot be stored. */
  | "vault.s3_unconfigured"
  | "vault.s3_keys_invalid"
  /** The store refused the key pair (wrong key, no list or read permission). */
  | "vault.s3_keys_refused"
  | "vault.s3_bucket_not_found"
  | "vault.s3_unavailable"
  /** The endpoint answered, but not as S3 does (often a region the bucket is not in). */
  | "vault.s3_unexpected";

export const S3_CONNECT_ERROR_CODES: readonly S3ConnectErrorCode[] = [
  "vault.s3_endpoint_invalid",
  "vault.s3_endpoint_private",
  "vault.s3_region_invalid",
  "vault.s3_bucket_invalid",
  "vault.s3_prefix_invalid",
  "vault.s3_unconfigured",
  "vault.s3_keys_invalid",
  "vault.s3_keys_refused",
  "vault.s3_bucket_not_found",
  "vault.s3_unavailable",
  "vault.s3_unexpected",
];

export interface S3ConnectContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly settings: S3SourceSettings;
  /** A fake S3 in tests. */
  readonly fetch?: FetchFunction;
}

const ACCESS_KEY_ID = /^[\x21-\x7e]{1,128}$/;
const SECRET_ACCESS_KEY = /^[\x21-\x7e]{1,256}$/;

export async function connectS3Source(ctx: S3ConnectContext, userId: string, input: S3ConnectInput): Promise<Result<StoredS3Source, S3ConnectErrorCode>> {
  if (ctx.settings.kind !== "configured") return err("vault.s3_unconfigured");
  const location = parseS3Location(input, { allowPrivateEndpoints: ctx.settings.allowPrivateEndpoints });
  if (!location.ok) return location;
  const credentials = { accessKeyId: input.accessKeyId.trim(), secretAccessKey: input.secretAccessKey.trim() };
  if (!ACCESS_KEY_ID.test(credentials.accessKeyId) || !SECRET_ACCESS_KEY.test(credentials.secretAccessKey)) return err("vault.s3_keys_invalid");
  const probe = await createS3Source({ location: location.value, credentials, clock: ctx.clock, ...(ctx.fetch === undefined ? {} : { fetch: ctx.fetch }) }).probe();
  if (!probe.ok) return err(toConnectError(probe.error));
  const saved = await saveS3Source(ctx.db, {
    userId,
    location: { endpoint: location.value.endpoint.toString(), region: location.value.region, bucket: location.value.bucket, prefix: location.value.prefix },
    sealedCredentials: sealS3Credentials(ctx.settings.keyring, userId, credentials),
    now: ctx.clock.now(),
  });
  return ok(saved);
}

/** One of the connect codes, or null for anything else in a URL (so a crafted link cannot put text on the screen). */
export function readS3ConnectError(value: unknown): S3ConnectErrorCode | null {
  return typeof value === "string" && (S3_CONNECT_ERROR_CODES as readonly string[]).includes(value) ? (value as S3ConnectErrorCode) : null;
}

function toConnectError(error: SourceErrorCode): S3ConnectErrorCode {
  switch (error) {
    case "source.disconnected":
      return "vault.s3_keys_refused";
    case "source.not_found":
      return "vault.s3_bucket_not_found";
    case "source.rate_limited":
    case "source.unavailable":
      return "vault.s3_unavailable";
    default:
      return "vault.s3_unexpected";
  }
}

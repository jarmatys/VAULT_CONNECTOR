// What the S3 form shows after a failed attempt: the error and the location typed (the key is never sent back).
import type { S3ConnectErrorCode } from "../../../../../vault/sources/s3/connect.ts";

export interface S3FormState {
  readonly error: S3ConnectErrorCode | "vault.s3_rate_limited" | null;
  readonly values: { readonly endpoint: string; readonly region: string; readonly bucket: string; readonly prefix: string };
}

export const INITIAL_S3_FORM_STATE: S3FormState = { error: null, values: { endpoint: "", region: "", bucket: "", prefix: "" } };

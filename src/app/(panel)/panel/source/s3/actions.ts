"use server";
// The S3 form's action. It checks the session, counts the attempt against the account's limit, then connects the
// signed-in account's own source; on success it asks for a sync step at once, so picks kept from an earlier key resume
// without waiting for the five-minute check. The form gets back only an error code and what it may show again: never
// a key.
import { requireUser } from "@softure-ai/auth/next";
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { consumeRateLimit, subjectKey } from "@softure-ai/security/server";
import { redirect } from "next/navigation";
import { getRequestDatabase } from "../../../../../auth/module-context.ts";
import { readS3SourceSettings } from "../../../../../vault/settings.ts";
import { connectS3Source } from "../../../../../vault/sources/s3/connect.ts";
import { S3_CONNECT_RATE_LIMIT_BUCKET } from "../../../../../vault/sources/s3/rate-limit.ts";
import { S3_LINKED_PATH, S3_SOURCE_PATH } from "../../../../../vault/sources/source-paths.ts";
import { readVaultStorageSettings } from "../../../../../vault/storage/storage-settings.ts";
import { enqueueVaultSync } from "../../../../../vault/sync/sync-jobs.ts";
import type { S3FormState } from "./form-state.ts";

export async function connectS3Action(_previous: S3FormState, formData: FormData): Promise<S3FormState> {
  const user = await requireUser({ next: S3_SOURCE_PATH });
  const values = {
    endpoint: readField(formData, "endpoint"),
    region: readField(formData, "region"),
    bucket: readField(formData, "bucket"),
    prefix: readField(formData, "prefix"),
  };
  const db = await getRequestDatabase();
  const ctx = { db, clock: systemClock, config: getSoftureConfig() };
  const allowed = await consumeRateLimit(ctx, { bucket: S3_CONNECT_RATE_LIMIT_BUCKET, key: subjectKey(user.id) });
  if (!allowed.ok) return { error: "vault.s3_rate_limited", values };
  const connected = await connectS3Source({ db, clock: systemClock, settings: readS3SourceSettings(process.env) }, user.id, {
    ...values,
    accessKeyId: readField(formData, "accessKeyId"),
    secretAccessKey: readField(formData, "secretAccessKey"),
  });
  if (!connected.ok) return { error: connected.error, values };
  if (readVaultStorageSettings(process.env).kind === "configured") {
    // The same check the five-minute schedule makes, now.
    await enqueueVaultSync(ctx, { userId: user.id, trigger: "schedule" });
  }
  redirect(S3_LINKED_PATH);
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 1000) : "";
}

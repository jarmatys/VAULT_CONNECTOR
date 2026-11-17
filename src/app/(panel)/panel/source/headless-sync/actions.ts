"use server";
// The sync form's actions. Each checks the session and acts only for the signed-in account. Signing in counts against
// the account's limit and holds the session the service hands out in a sealed, httpOnly cookie scoped to this form for
// ten minutes; connecting reads it back, connects the vault and drops the cookie (the session now lives sealed in the
// account's source); going back ends the held session at the service. The account's password and an end-to-end
// vault's encryption password never come back to the browser; the latter never reaches this server at all.
import { requireUser } from "@softure-ai/auth/next";
import { getSoftureConfig } from "@softure-ai/core/next";
import { consumeRateLimit, subjectKey } from "@softure-ai/security/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectHeadlessSyncVault, openPendingToken, PENDING_TOKEN_TTL_MS, sealPendingToken, signInForLink, signOutPendingToken } from "../../../../../vault/sources/headless-sync/link.ts";
import { HEADLESS_SYNC_PENDING_COOKIE } from "../../../../../vault/sources/headless-sync/pending-cookie.ts";
import { getHeadlessSyncLinkContext } from "../../../../../vault/sources/headless-sync/request-context.ts";
import { HEADLESS_SYNC_CONNECT_RATE_LIMIT_BUCKET } from "../../../../../vault/sources/s3/rate-limit.ts";
import { HEADLESS_SYNC_LINKED_PATH, HEADLESS_SYNC_SOURCE_PATH, SOURCE_PATH, toHeadlessSyncErrorPath } from "../../../../../vault/sources/source-paths.ts";
import { readVaultStorageSettings } from "../../../../../vault/storage/storage-settings.ts";
import { enqueueVaultSync } from "../../../../../vault/sync/sync-jobs.ts";

export async function signInToSyncAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: HEADLESS_SYNC_SOURCE_PATH });
  const ctx = await getHeadlessSyncLinkContext();
  if (ctx === null) redirect(HEADLESS_SYNC_SOURCE_PATH);
  const allowed = await consumeRateLimit({ db: ctx.db, clock: ctx.clock, config: getSoftureConfig() }, { bucket: HEADLESS_SYNC_CONNECT_RATE_LIMIT_BUCKET, key: subjectKey(user.id) });
  if (!allowed.ok) redirect(toHeadlessSyncErrorPath("vault.headless_rate_limited"));
  const signedIn = await signInForLink(ctx, { email: readField(formData, "email"), password: readField(formData, "password"), mfaCode: readField(formData, "mfaCode") });
  if (!signedIn.ok) redirect(toHeadlessSyncErrorPath(signedIn.error));
  await setPendingCookie(sealPendingToken(ctx, user.id, signedIn.value));
  redirect(HEADLESS_SYNC_SOURCE_PATH);
}

export async function connectSyncVaultAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: HEADLESS_SYNC_SOURCE_PATH });
  const ctx = await getHeadlessSyncLinkContext();
  if (ctx === null) redirect(HEADLESS_SYNC_SOURCE_PATH);
  const cookieStore = await cookies();
  const token = openPendingToken(ctx, user.id, cookieStore.get(HEADLESS_SYNC_PENDING_COOKIE)?.value);
  if (token === null) {
    clearPendingCookie(cookieStore);
    redirect(toHeadlessSyncErrorPath("vault.headless_link_expired"));
  }
  const key = readField(formData, "key");
  const connected = await connectHeadlessSyncVault(ctx, user.id, { token, vaultId: readField(formData, "vaultId"), keyHex: key === "" ? null : key });
  if (!connected.ok) {
    if (connected.error === "vault.headless_link_expired") clearPendingCookie(cookieStore);
    redirect(toHeadlessSyncErrorPath(connected.error));
  }
  // The session now lives sealed in the source: drop the cookie without signing it out.
  clearPendingCookie(cookieStore);
  if (readVaultStorageSettings(process.env).kind === "configured") {
    await enqueueVaultSync({ db: ctx.db, clock: ctx.clock, config: getSoftureConfig() }, { userId: user.id, trigger: "schedule" });
  }
  redirect(HEADLESS_SYNC_LINKED_PATH);
}

/** Ends the held session at the service and drops it; `again` goes back to the sign-in form, otherwise to the source screen. */
export async function leaveSyncSignInAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: HEADLESS_SYNC_SOURCE_PATH });
  const ctx = await getHeadlessSyncLinkContext();
  const cookieStore = await cookies();
  if (ctx !== null) {
    const token = openPendingToken(ctx, user.id, cookieStore.get(HEADLESS_SYNC_PENDING_COOKIE)?.value);
    if (token !== null) await signOutPendingToken(ctx, token);
  }
  clearPendingCookie(cookieStore);
  redirect(formData.get("again") === "1" ? HEADLESS_SYNC_SOURCE_PATH : SOURCE_PATH);
}

async function setPendingCookie(value: string): Promise<void> {
  (await cookies()).set(HEADLESS_SYNC_PENDING_COOKIE, value, {
    httpOnly: true,
    secure: getSoftureConfig().appOrigin.startsWith("https:"),
    sameSite: "strict",
    path: HEADLESS_SYNC_SOURCE_PATH,
    maxAge: PENDING_TOKEN_TTL_MS / 1000,
  });
}

/** Drops the held session's cookie; the path must match the one it was set with, or the browser keeps it. */
function clearPendingCookie(cookieStore: Awaited<ReturnType<typeof cookies>>): void {
  cookieStore.delete({ name: HEADLESS_SYNC_PENDING_COOKIE, path: HEADLESS_SYNC_SOURCE_PATH });
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 1100) : "";
}

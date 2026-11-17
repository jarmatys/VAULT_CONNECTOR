// Dropbox's consent comes back here: the grant and the folder are checked and saved, a sync step is asked for at once
// (so picks kept from an earlier link resume without waiting for the five-minute check), and the browser goes to the
// source screen, or back to the Dropbox form with the reason.
import { requireUser } from "@softure-ai/auth/next";
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { redirect } from "next/navigation";
import { completeDropboxLink, DROPBOX_CALLBACK_PATH } from "../../../../../../vault/sources/dropbox/link.ts";
import { getDropboxLinkContext } from "../../../../../../vault/sources/dropbox/request-context.ts";
import { DROPBOX_LINKED_PATH, SOURCE_PATH, toDropboxErrorPath } from "../../../../../../vault/sources/source-paths.ts";
import { readVaultStorageSettings } from "../../../../../../vault/storage/storage-settings.ts";
import { enqueueVaultSync } from "../../../../../../vault/sync/sync-jobs.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<never> {
  const user = await requireUser({ next: DROPBOX_CALLBACK_PATH });
  const ctx = await getDropboxLinkContext();
  if (ctx === null) redirect(SOURCE_PATH);
  const query = new URL(request.url).searchParams;
  const linked = await completeDropboxLink(ctx, user.id, { state: query.get("state"), code: query.get("code"), error: query.get("error") });
  if (!linked.ok) redirect(toDropboxErrorPath(linked.error));
  if (readVaultStorageSettings(process.env).kind === "configured") {
    await enqueueVaultSync({ db: ctx.db, clock: systemClock, config: getSoftureConfig() }, { userId: user.id, trigger: "schedule" });
  }
  redirect(DROPBOX_LINKED_PATH);
}

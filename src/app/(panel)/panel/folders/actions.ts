"use server";
// The folder picker's save. It checks the session, reads the vault's tree again (a posted folder must be one of it)
// and replaces only the signed-in account's own picks; a saved pick asks for a sync step at once (when this instance has a
// note store), so the copies follow the new picks without waiting for the five-minute check, and runs the vault's
// sync and index steps once after the response (VC-12), so a new account does not wait for the minute's tick either.
import { requireUser } from "@softure-ai/auth/next";
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { handlers } from "../../../../jobs/handlers.ts";
import { runVaultJobsNow } from "../../../../jobs/vault-kick.ts";
import { FOLDERS_PATH, readPostedFolders, toFolderResultPath } from "../../../../vault/folders/folder-paths.ts";
import { loadFolderPicker } from "../../../../vault/folders/load-folders.ts";
import { saveSharedFolders } from "../../../../vault/folders/shared-folders.ts";
import { getRequestSourceOpener } from "../../../../vault/sources/request-opener.ts";
import { readVaultStorageSettings } from "../../../../vault/storage/storage-settings.ts";
import { enqueueVaultSync } from "../../../../vault/sync/sync-jobs.ts";

/** Saves the ticked folders (`folder:<path>` fields) as the account's whole pick. */
export async function saveFoldersAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: FOLDERS_PATH });
  const db = await getRequestDatabase();
  const picker = await loadFolderPicker(db, getRequestSourceOpener(), user.id);
  if (picker.kind !== "ready") redirect(toFolderResultPath({ ok: false, error: picker.kind === "no_source" ? "vault.folder_no_source" : "vault.folder_source_failed" }));
  const paths = readPostedFolders(formData);
  const saved = await saveSharedFolders(db, { userId: user.id, paths, knownFolders: picker.tree.paths, now: systemClock.now() });
  if (saved.ok && readVaultStorageSettings(process.env).kind === "configured") {
    const config = getSoftureConfig();
    await enqueueVaultSync({ db, clock: systemClock, config }, { userId: user.id, trigger: "picks" });
    after(() => runVaultJobsNow({ db, config, handlers }));
  }
  redirect(toFolderResultPath(saved));
}

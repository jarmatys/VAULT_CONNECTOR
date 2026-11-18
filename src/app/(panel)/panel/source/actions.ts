"use server";
// The source screen's two actions. Each checks the session first and acts only on the signed-in account's own row.
// Disconnecting a Dropbox folder also asks Dropbox to end the grant, and a synced vault ends its session at the sync
// service, both best effort: the row is forgotten either way.
import { requireUser } from "@softure-ai/auth/next";
import { redirect } from "next/navigation";
import { startGithubLink } from "../../../../vault/sources/github/link.ts";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { getGithubLinkContext } from "../../../../vault/sources/github/request-context.ts";
import { SOURCE_PATH } from "../../../../vault/sources/source-paths.ts";
import { revokeDropboxSource } from "../../../../vault/sources/dropbox/link.ts";
import { getDropboxLinkContext } from "../../../../vault/sources/dropbox/request-context.ts";
import { signOutHeadlessSyncSource } from "../../../../vault/sources/headless-sync/link.ts";
import { getHeadlessSyncLinkContext } from "../../../../vault/sources/headless-sync/request-context.ts";
import { deleteSource, findSource } from "../../../../vault/sources/store.ts";

/** Starts a link and sends the browser to the App's install page on GitHub. */
export async function connectGithubAction(): Promise<never> {
  const user = await requireUser({ next: SOURCE_PATH });
  const ctx = await getGithubLinkContext();
  if (ctx === null) redirect(SOURCE_PATH);
  const installUrl = await startGithubLink(ctx, user.id);
  redirect(installUrl.toString());
}

/** Forgets the account's source; the App stays installed on GitHub until the person removes it there. */
export async function disconnectSourceAction(): Promise<never> {
  const user = await requireUser({ next: SOURCE_PATH });
  const db = await getRequestDatabase();
  const source = await findSource(db, user.id);
  if (source?.kind === "dropbox") {
    const ctx = await getDropboxLinkContext();
    if (ctx !== null) await revokeDropboxSource(ctx, source);
  }
  if (source?.kind === "headless-sync") {
    const ctx = await getHeadlessSyncLinkContext();
    if (ctx !== null) await signOutHeadlessSyncSource(ctx, source);
  }
  await deleteSource(db, user.id);
  redirect(SOURCE_PATH);
}

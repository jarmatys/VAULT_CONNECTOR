"use server";
// The Dropbox form's action. It checks the session, starts a link for the signed-in account with the folder it typed
// and sends the browser to Dropbox's consent page; a folder that cannot be a vault comes back as an error code.
import { requireUser } from "@softure-ai/auth/next";
import { redirect } from "next/navigation";
import { startDropboxLink } from "../../../../../vault/sources/dropbox/link.ts";
import { getDropboxLinkContext } from "../../../../../vault/sources/dropbox/request-context.ts";
import { DROPBOX_SOURCE_PATH, toDropboxErrorPath } from "../../../../../vault/sources/source-paths.ts";

export async function connectDropboxAction(formData: FormData): Promise<never> {
  const user = await requireUser({ next: DROPBOX_SOURCE_PATH });
  const ctx = await getDropboxLinkContext();
  if (ctx === null) redirect(DROPBOX_SOURCE_PATH);
  const folder = formData.get("folder");
  const started = await startDropboxLink(ctx, user.id, typeof folder === "string" ? folder.slice(0, 1000) : "");
  redirect(started.ok ? started.value.toString() : toDropboxErrorPath(started.error));
}

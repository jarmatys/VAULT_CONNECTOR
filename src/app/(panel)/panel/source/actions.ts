"use server";
// The source screen's two actions. Each checks the session first and acts only on the signed-in account's own row.
import { requireUser } from "@softure-ai/auth/next";
import { redirect } from "next/navigation";
import { startGithubLink } from "../../../../vault/sources/github/link.ts";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { getGithubLinkContext } from "../../../../vault/sources/github/request-context.ts";
import { SOURCE_PATH } from "../../../../vault/sources/source-paths.ts";
import { deleteSource } from "../../../../vault/sources/store.ts";

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
  await deleteSource(await getRequestDatabase(), user.id);
  redirect(SOURCE_PATH);
}

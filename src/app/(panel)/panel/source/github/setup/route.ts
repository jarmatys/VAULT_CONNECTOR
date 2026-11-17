// GitHub's setup redirect after the App is installed: the claimed installation goes on the account's state and the
// browser goes on to the App's user authorization, or back to the source screen with the reason it stopped.
import { requireUser } from "@softure-ai/auth/next";
import { redirect } from "next/navigation";
import { continueGithubLink, GITHUB_SETUP_PATH } from "../../../../../../vault/sources/github/link.ts";
import { getGithubLinkContext } from "../../../../../../vault/sources/github/request-context.ts";
import { SOURCE_PATH, toSourceResultPath } from "../../../../../../vault/sources/source-paths.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<never> {
  const user = await requireUser({ next: GITHUB_SETUP_PATH });
  const ctx = await getGithubLinkContext();
  if (ctx === null) redirect(SOURCE_PATH);
  const query = new URL(request.url).searchParams;
  const next = await continueGithubLink(ctx, user.id, {
    state: query.get("state"),
    installationId: query.get("installation_id"),
    setupAction: query.get("setup_action"),
  });
  redirect(next.ok ? next.value.toString() : toSourceResultPath(next));
}

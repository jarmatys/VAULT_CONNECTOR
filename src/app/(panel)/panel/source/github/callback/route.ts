// The App's user authorization comes back here: the link is proven and saved, and the source screen says how it went.
import { requireUser } from "@softure-ai/auth/next";
import { redirect } from "next/navigation";
import { completeGithubLink, GITHUB_CALLBACK_PATH } from "../../../../../../vault/sources/github/link.ts";
import { getGithubLinkContext } from "../../../../../../vault/sources/github/request-context.ts";
import { SOURCE_PATH, toSourceResultPath } from "../../../../../../vault/sources/source-paths.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<never> {
  const user = await requireUser({ next: GITHUB_CALLBACK_PATH });
  const ctx = await getGithubLinkContext();
  if (ctx === null) redirect(SOURCE_PATH);
  const query = new URL(request.url).searchParams;
  const linked = await completeGithubLink(ctx, user.id, { state: query.get("state"), code: query.get("code"), error: query.get("error") });
  redirect(toSourceResultPath(linked));
}

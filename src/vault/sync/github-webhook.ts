// GitHub's push webhook: a signed delivery for a push to the default branch of a connected repository asks for a sync
// step of every account that follows that repository. The signature, the size limit and replays are
// `@softure-ai/security`'s `handleWebhook`; this file only says which deliveries matter and enqueues the steps, inside
// the delivery's transaction (a failure rolls the delivery back and GitHub retries).
import type { Queryable } from "@softure-ai/db";
import { handleWebhook, type SecurityContext } from "@softure-ai/security/server";
import { WEBHOOK_SENDERS } from "@softure-ai/security";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { enqueueVaultSync } from "./sync-jobs.ts";

/** The source name the delivery ids are recorded under. */
export const GITHUB_WEBHOOK_SOURCE = "github";
/** The environment variable holding the GitHub App's webhook secret. */
export const GITHUB_WEBHOOK_SECRET_ENV = "GH_WEBHOOK_SECRET";
/** GitHub caps a payload at 25 MB; a push event of a vault is far smaller, so 5 MiB refuses only an abuse. */
const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;

const pushEvent = z.looseObject({
  ref: z.string().optional(),
  repository: z.looseObject({ id: z.number().int(), default_branch: z.string().optional() }).optional(),
});
type GithubEvent = z.infer<typeof pushEvent>;

/** Answers one GitHub delivery; only `push` events to a repository's default branch enqueue anything. */
export async function receiveGithubWebhook(
  ctx: SecurityContext,
  request: Request,
  secret: string | undefined,
): Promise<Response> {
  const eventName = request.headers.get("x-github-event");
  return handleWebhook<GithubEvent>(ctx, request, {
    source: GITHUB_WEBHOOK_SOURCE,
    maxBytes: MAX_WEBHOOK_BYTES,
    sender: WEBHOOK_SENDERS.github,
    secret,
    schema: pushEvent,
    handle: async (event, txCtx) => {
      const repositoryId = getPushedDefaultBranchRepository(eventName, event);
      if (repositoryId === null) return;
      for (const userId of await listFollowingAccounts(txCtx.db, repositoryId)) {
        await enqueueVaultSync(txCtx, { userId, trigger: "webhook" });
      }
    },
  });
}

/** The repository id of a push to its default branch, or null for any other event. */
export function getPushedDefaultBranchRepository(eventName: string | null, event: GithubEvent): number | null {
  if (eventName !== "push" || event.repository === undefined || event.ref === undefined) return null;
  const branch = event.repository.default_branch;
  if (branch === undefined || event.ref !== `refs/heads/${branch}`) return null;
  return event.repository.id;
}

async function listFollowingAccounts(db: Queryable, repositoryId: number): Promise<readonly string[]> {
  const result = await db.execute<{ user_id: string }>(sql`
    SELECT user_id FROM vault.sources
    WHERE kind = 'github' AND status = 'connected' AND github_repository_id = ${repositoryId}
    ORDER BY user_id`);
  return result.rows.map((row) => row.user_id);
}

// POST /api/webhooks/github: the GitHub App's webhook. A push to a connected repository's default branch enqueues a
// sync step for every account following it; the signature is checked with GH_WEBHOOK_SECRET.
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { GITHUB_WEBHOOK_SECRET_ENV, receiveGithubWebhook } from "../../../../vault/sync/github-webhook.ts";

export async function POST(request: Request): Promise<Response> {
  const ctx = { db: await getRequestDatabase(), clock: systemClock, config: getSoftureConfig() };
  return receiveGithubWebhook(ctx, request, process.env[GITHUB_WEBHOOK_SECRET_ENV]);
}

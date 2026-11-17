// `vault.purge-lapsed` (VC-15, FR-19): once an account's access has been over for the grace period (`GRACE_DAYS`), its
// copies and its index are removed; the objects go through `vault.erase-copies`. The source, the picked folders and the
// sync history stay, and the sync copies nothing for a lapsed account (`LAPSED_CAPS`), so a payment (billing's
// `onAccessChanged` re-plans the sync) copies everything back. An unlimited (self-hosted) instance purges nothing.
import { ok, type ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { getEntitlementStatesSql } from "@softure-ai/billing/server";
import { defineJobHandler, type JobHandlers } from "@softure-ai/jobs";
import { enqueueJob } from "@softure-ai/jobs/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { GRACE_DAYS, isPlanLimited } from "../../lib/plans.ts";
import { readConfiguredKeySecret, removeAccountCopies, type ReadKeySecret } from "../erase/vault-privacy.ts";
import { VAULT_PURGE_QUEUE } from "./lapsed-queues.ts";

export { VAULT_PURGE_QUEUE, VAULT_PURGE_QUEUES, VAULT_PURGE_SCHEDULES } from "./lapsed-queues.ts";

type Environment = Readonly<Record<string, string | undefined>>;

/** Accounts purged per run; a full batch continues in another run. */
export const PURGE_BATCH = 50;

/**
 * Accounts whose access ended at least `GRACE_DAYS` ago and that still have copies (or planned copies), oldest end
 * first, at most `limit`.
 */
export async function listLapsedAccounts(ctx: ModuleContext<Queryable>, input: { readonly limit: number }): Promise<string[]> {
  const cutoff = new Date(ctx.clock.now().getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const states = getEntitlementStatesSql(ctx);
  const result = await ctx.db.execute<{ user_id: string }>(sql`
    SELECT s.user_id FROM ${states} s
    WHERE s.status = 'read_only' AND s.read_only_since <= ${cutoff.toISOString()}::timestamptz
      AND (EXISTS (SELECT 1 FROM vault.notes n WHERE n.user_id = s.user_id)
        OR EXISTS (SELECT 1 FROM vault.sync_items i JOIN vault.sync_runs r ON r.id = i.run_id WHERE r.user_id = s.user_id))
    ORDER BY s.read_only_since, s.user_id
    LIMIT ${input.limit}`);
  return result.rows.map((row) => row.user_id);
}

/** Removes the copies of every lapsed account (a batch), each in its own transaction; answers the accounts purged. */
export async function purgeLapsedAccounts(
  ctx: ModuleContext<Queryable>,
  input: { readonly limit?: number; readonly readKeySecret?: ReadKeySecret; readonly env?: Environment } = {},
): Promise<string[]> {
  if (!isPlanLimited(input.env ?? process.env)) return [];
  const accounts = await listLapsedAccounts(ctx, { limit: input.limit ?? PURGE_BATCH });
  for (const userId of accounts) {
    await ctx.db.transaction(async (tx) => {
      await removeAccountCopies({ ...ctx, db: tx }, userId, input.readKeySecret ?? readConfiguredKeySecret);
    });
  }
  return accounts;
}

export interface VaultPurgeDependencies {
  readonly readKeySecret?: ReadKeySecret;
  readonly batch?: number;
  readonly env?: Environment;
}

export function createVaultPurgeJobHandlers(dependencies: VaultPurgeDependencies = {}): JobHandlers {
  return {
    [VAULT_PURGE_QUEUE]: defineJobHandler({
      payload: z.object({}),
      run: async (_payload, context) => {
        const batch = dependencies.batch ?? PURGE_BATCH;
        const ctx = { db: context.db, clock: context.clock, config: context.config };
        const purged = await purgeLapsedAccounts(ctx, { limit: batch, ...dependencies });
        if (purged.length === batch) await enqueueJob(ctx, { queue: VAULT_PURGE_QUEUE, payload: {}, origin: "vault.continue" });
        return ok();
      },
    }),
  };
}

// The wait after a pick (VC-12): saving the folders enqueues a sync step, and the next minute's tick would take it, then
// the index step it enqueues a minute later. The folder action instead runs the vault's two queues once, after its
// response (`after()`), under a worker name of its own, so a new account's notes are copied and searchable in seconds.
// The same handlers and leases as the tick: a job already taken by the tick is not run twice. A failure is logged and
// left to the next tick, never shown to the user, who has already been answered.
import type { SoftureConfig } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { JobHandlers } from "@softure-ai/jobs";
import { runJobsTick } from "@softure-ai/jobs/server";
import { createLogger } from "@softure-ai/observability";
import { VAULT_INDEX_QUEUE } from "../vault/index/index-queues.ts";
import { VAULT_SYNC_QUEUE } from "../vault/sync/sync-queues.ts";

/** Below the Worker's thirty seconds of work after a response; a longer copy is finished by the minute's tick. */
export const VAULT_KICK_BUDGET_MS = 20_000;
/** The heartbeat row and lease owner of these runs, apart from the tick's. */
export const VAULT_KICK_WORKER = "vault-kick";

const logger = createLogger("vaultconnector.jobs");

export interface RunVaultJobsNowOptions {
  readonly db: Queryable;
  readonly config: SoftureConfig;
  readonly handlers: JobHandlers;
  readonly budgetMs?: number;
}

/** Runs the due sync and index steps now; resolves with whether every claim reached the database. */
export async function runVaultJobsNow(options: RunVaultJobsNowOptions): Promise<boolean> {
  try {
    const report = await runJobsTick({
      config: options.config,
      handlers: options.handlers,
      db: options.db,
      queues: [VAULT_SYNC_QUEUE, VAULT_INDEX_QUEUE],
      budgetMs: options.budgetMs ?? VAULT_KICK_BUDGET_MS,
      workerName: VAULT_KICK_WORKER,
      logger,
    });
    return report.isHealthy;
  } catch (error) {
    logger.warn("running the vault's jobs after a pick failed; the next tick runs them", { error });
    return false;
  }
}

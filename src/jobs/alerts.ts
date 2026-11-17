// What the operator is told when background work breaks (VC-13, FR-27), on both hosts:
// - three failed syncs in a row for one account fire one alert, and the account's next good sync one recovery
//   (`recordSyncOutcome`, called by the sync's job handler);
// - a failed job, a schedule that turns failing or late, and a paused queue come from jobs' hooks (`alertsFromJobs`);
// - no successful jobs tick for ten minutes cannot be told by the tick itself, so every tick that runs jobs logs one
//   `jobs heartbeat` line a minute (`operator.heartbeat`) and the observability backend fires on its silence
//   (`grafana/alert-rules.json`, applied on the owner's step).
// Alerts go through `@softure-ai/alerts`: one message per key, repeats counted, a recovery on resolve, delivered on the
// jobs queue to the operator's mail and, when set, a webhook. Keys and text carry the account id, never an address.
import { ok, type Clock, type SoftureConfig } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { alert, resolveAlert } from "@softure-ai/alerts/server";
import { defineJobHandler, type JobHandlers } from "@softure-ai/jobs";
import { createLogger } from "@softure-ai/observability";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { en } from "../messages/en.ts";
import { ADMIN_PATH } from "../panel-paths.ts";
import type { SyncOutcome } from "../vault/sync/sync-jobs.ts";

/** Failed syncs in a row for one account before the operator is alerted. */
export const SYNC_FAILURES_BEFORE_ALERT = 3;

/** The admin pages: the background work's health and the recent alerts. */
export const ADMIN_JOBS_PATH = `${ADMIN_PATH}/jobs`;
export const ADMIN_ALERTS_PATH = `${ADMIN_PATH}/alerts`;

/** The schedule whose run is the jobs tick's heartbeat in the logs. */
export const OPERATOR_HEARTBEAT_QUEUE = "operator.heartbeat";
export const OPERATOR_HEARTBEAT_QUEUES = { [OPERATOR_HEARTBEAT_QUEUE]: { maxAttempts: 1, leaseSeconds: 60 } } as const;
export const OPERATOR_HEARTBEAT_SCHEDULES = { [OPERATOR_HEARTBEAT_QUEUE]: { every: "1m" } } as const;

/** The log line the silence rule of `grafana/alert-rules.json` counts; changing it changes the rule too. */
export const HEARTBEAT_LOG_LINE = "jobs heartbeat";

/** The observability names of the background work, the same on Workers (scheduled) and on Node (scripts/worker.ts). */
export const SERVICE_NAMESPACE = "vaultconnector";
export const JOBS_SERVICE_NAME = "vaultconnector-jobs";

const heartbeatLogger = createLogger("vaultconnector.jobs");

interface AlertContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly config: SoftureConfig;
}

/** The alert key of one account's failing syncs. */
export function getSyncAlertKey(userId: string): string {
  return `vault.sync:${userId}`;
}

/**
 * Counts the account's failed syncs in a row. The third fires the alert (once: later failures only count); a success
 * after an alert resolves it, and any success clears the count. One transaction, so the alert's delivery jobs commit
 * with the count.
 */
export async function recordSyncOutcome(ctx: AlertContext, input: { readonly userId: string; readonly outcome: SyncOutcome }): Promise<void> {
  const now = ctx.clock.now().toISOString();
  await ctx.db.transaction(async (tx) => {
    const scoped = { ...ctx, db: tx };
    if (input.outcome.kind === "succeeded") {
      const cleared = await tx.execute<{ failures: number }>(
        sql`DELETE FROM operator.sync_failure_streaks WHERE user_id = ${input.userId} RETURNING failures`,
      );
      const failures = cleared.rows[0]?.failures ?? 0;
      if (failures >= SYNC_FAILURES_BEFORE_ALERT) await resolveAlert(scoped, getSyncAlertKey(input.userId));
      return;
    }
    const counted = await tx.execute<{ failures: number }>(sql`
      INSERT INTO operator.sync_failure_streaks (user_id, failures, last_error_code, started_at, updated_at)
      VALUES (${input.userId}, 1, ${input.outcome.errorCode}, ${now}, ${now})
      ON CONFLICT (user_id) DO UPDATE
        SET failures = operator.sync_failure_streaks.failures + 1, last_error_code = EXCLUDED.last_error_code, updated_at = EXCLUDED.updated_at
      RETURNING failures`);
    const failures = counted.rows[0]?.failures ?? 0;
    if (failures !== SYNC_FAILURES_BEFORE_ALERT) return;
    const raised = await alert(scoped, {
      key: getSyncAlertKey(input.userId),
      severity: "warning",
      title: en.operatorAlerts.syncFailingTitle,
      details: en.operatorAlerts.syncFailingDetails({ failures, errorCode: input.outcome.errorCode, userId: input.userId }),
      link: new URL(ADMIN_JOBS_PATH, ctx.config.appOrigin).toString(),
    });
    // The key and text are built here and always valid; a refusal is a bug, not a failed sync.
    if (!raised.ok) throw new Error(`recordSyncOutcome: the alert was refused (${raised.error})`);
  });
}

/** The heartbeat's handler: one log line per run, the proof for the backend that a tick ran a job. */
export const operatorJobHandlers: JobHandlers = {
  [OPERATOR_HEARTBEAT_QUEUE]: defineJobHandler({
    payload: z.object({}),
    run: () => {
      heartbeatLogger.info(HEARTBEAT_LOG_LINE);
      return Promise.resolve(ok());
    },
  }),
};

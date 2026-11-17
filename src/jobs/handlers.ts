// The app's job handlers, one per queue of `jobs({ queues, schedules })` in softure.config.ts. Both runners use them:
// the Cron Trigger's tick on Workers (worker.ts) and the worker process on Node (scripts/worker.ts). The sync reads its
// store, key secret and GitHub App from the environment when a job runs, never at import. Each sync step's outcome
// feeds the operator's alerts (VC-13), which the alerts module delivers on its own queues.
import { alertsJobHandlers } from "@softure-ai/alerts/jobs";
import type { JobHandlers } from "@softure-ai/jobs";
import { securityJobHandlers } from "@softure-ai/security/jobs";
import { createVaultSyncJobHandlers, readVaultSyncDependencies } from "../vault/sync/sync-jobs.ts";
import { operatorJobHandlers, recordSyncOutcome } from "./alerts.ts";

export const handlers: JobHandlers = {
  ...securityJobHandlers,
  ...alertsJobHandlers,
  ...operatorJobHandlers,
  ...createVaultSyncJobHandlers(() => ({ ...readVaultSyncDependencies(), onSyncOutcome: recordSyncOutcome })),
};

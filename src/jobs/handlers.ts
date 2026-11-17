// The app's job handlers, one per queue of `jobs({ queues, schedules })` in softure.config.ts. Both runners use them:
// the Cron Trigger's tick on Workers (worker.ts) and the worker process on Node (scripts/worker.ts). The sync reads its
// store, key secret and GitHub App from the environment when a job runs, never at import. Each sync step's outcome
// feeds the operator's alerts (VC-13), which the alerts module delivers on its own queues. Every embedding call of the
// index records its tokens per account (VC-14). Billing mails the access reminders; a lapsed account's copies go after
// the grace period (VC-15).
import { alertsJobHandlers } from "@softure-ai/alerts/jobs";
import { createBillingJobHandlers } from "@softure-ai/billing/jobs";
import type { JobHandlers } from "@softure-ai/jobs";
import { mcpAccessJobHandlers } from "@softure-ai/mcp-access/jobs";
import { meteringJobHandlers } from "@softure-ai/metering/jobs";
import { securityJobHandlers } from "@softure-ai/security/jobs";
import { createVaultEraseJobHandlers, readVaultEraseDependencies } from "../vault/erase/erase-jobs.ts";
import { createVaultIndexJobHandlers, readVaultIndexDependencies } from "../vault/index/index-jobs.ts";
import { getNoteCaps } from "../vault/limits/account-limits.ts";
import { createVaultPurgeJobHandlers } from "../vault/limits/lapsed-copies.ts";
import { createVaultSyncJobHandlers, readVaultSyncDependencies } from "../vault/sync/sync-jobs.ts";
import { operatorJobHandlers, recordSyncOutcome } from "./alerts.ts";

export const handlers: JobHandlers = {
  ...securityJobHandlers,
  ...mcpAccessJobHandlers,
  ...meteringJobHandlers,
  ...alertsJobHandlers,
  ...operatorJobHandlers,
  // The plan's caps on what an account may copy (VC-14) come from billing when a run is planned.
  ...createVaultSyncJobHandlers(() => ({ ...readVaultSyncDependencies(), onSyncOutcome: recordSyncOutcome, getCaps: getNoteCaps })),
  ...createVaultIndexJobHandlers(() => readVaultIndexDependencies()),
  ...createVaultEraseJobHandlers(() => readVaultEraseDependencies()),
  // The copies of accounts whose access ended more than the grace period ago (VC-15).
  ...createVaultPurgeJobHandlers(),
  // Billing's reminder mail before and after access ends, in the package's own words, and the invoice request expiry.
  ...createBillingJobHandlers(),
};

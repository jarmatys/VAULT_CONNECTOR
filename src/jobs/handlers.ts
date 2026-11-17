// The app's job handlers, one per queue of `jobs({ queues, schedules })` in softure.config.ts. Both runners use them:
// the Cron Trigger's tick on Workers (worker.ts) and the worker process on Node (scripts/worker.ts). The sync reads its
// store, key secret and GitHub App from the environment when a job runs, never at import.
import type { JobHandlers } from "@softure-ai/jobs";
import { mcpAccessJobHandlers } from "@softure-ai/mcp-access/jobs";
import { securityJobHandlers } from "@softure-ai/security/jobs";
import { createVaultIndexJobHandlers, readVaultIndexDependencies } from "../vault/index/index-jobs.ts";
import { createVaultSyncJobHandlers, readVaultSyncDependencies } from "../vault/sync/sync-jobs.ts";

export const handlers: JobHandlers = {
  ...securityJobHandlers,
  ...mcpAccessJobHandlers,
  ...createVaultSyncJobHandlers(() => readVaultSyncDependencies()),
  ...createVaultIndexJobHandlers(() => readVaultIndexDependencies()),
};

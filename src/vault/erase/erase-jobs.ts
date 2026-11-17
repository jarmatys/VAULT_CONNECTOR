// `vault.erase-copies`: deletes the objects queued by account deletions (`vault.object_erasures`), a batch per run, and
// continues itself while keys remain. A key waits ERASE_DELAY_SECONDS after it was queued (past the sync lease) and
// leaves the queue only once its object is gone; a failed delete keeps it for the next attempt or the hourly run.
import { ok } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import { defineJobHandler, failJob, type JobHandlers } from "@softure-ai/jobs";
import { enqueueJob } from "@softure-ai/jobs/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createVaultStorage, readVaultStorageSettings } from "../storage/storage-settings.ts";
import { ERASE_DELAY_SECONDS, VAULT_ERASE_QUEUE } from "./erase-queues.ts";

export { VAULT_ERASE_QUEUE, VAULT_ERASE_QUEUES, VAULT_ERASE_SCHEDULES } from "./erase-queues.ts";

/** Objects deleted per run. */
export const ERASE_BATCH = 200;

export interface VaultEraseDependencies {
  /** Null when no store is configured: the queued keys wait for one. */
  readonly storage: FileStorage | null;
  readonly batch?: number;
}

export function readVaultEraseDependencies(env: Readonly<Record<string, string | undefined>> = process.env): VaultEraseDependencies {
  const settings = readVaultStorageSettings(env);
  return { storage: settings.kind === "configured" ? createVaultStorage(settings.location) : null };
}

export function createVaultEraseJobHandlers(dependencies: VaultEraseDependencies | (() => VaultEraseDependencies)): JobHandlers {
  const resolve = typeof dependencies === "function" ? dependencies : () => dependencies;
  return {
    [VAULT_ERASE_QUEUE]: defineJobHandler({
      payload: z.object({}),
      run: async (_payload, context) => {
        const deps = resolve();
        const batch = deps.batch ?? ERASE_BATCH;
        const keys = await listQueuedErasures(context.db, { limit: batch, queuedBefore: new Date(context.clock.now().getTime() - ERASE_DELAY_SECONDS * 1000) });
        if (keys.length === 0) return ok();
        if (deps.storage === null) return failJob("vault.erase_unconfigured");
        for (const key of keys) {
          await deps.storage.delete(key);
          await context.db.execute(sql`DELETE FROM vault.object_erasures WHERE object_key = ${key}`);
        }
        if (keys.length === batch) {
          await enqueueJob(context, { queue: VAULT_ERASE_QUEUE, payload: {}, origin: "vault.continue" });
        }
        return ok();
      },
    }),
  };
}

/**
 * The oldest queued keys, at most `limit`; with `queuedBefore`, only keys queued by then (a key is erased only once a
 * sync step that was in flight at the deletion has ended, whichever run comes first).
 */
export async function listQueuedErasures(db: Queryable, input: { readonly limit: number; readonly queuedBefore?: Date }): Promise<string[]> {
  const before = input.queuedBefore === undefined ? sql`` : sql` WHERE queued_at <= ${input.queuedBefore.toISOString()}`;
  const result = await db.execute<{ object_key: string }>(sql`
    SELECT object_key FROM vault.object_erasures${before} ORDER BY queued_at, object_key LIMIT ${input.limit}`);
  return result.rows.map((row) => row.object_key);
}

// The index's background jobs: `vault.index` runs one step of one account; a sync step that copied or removed notes
// enqueues it, and `vault.index-check` enqueues it every five minutes for every account with pending notes (after a
// change of model, or when a step's retries ran out). Every enqueue outside a running step carries the dedup key
// `vault.index:<account>`, so a burst of sync steps merges into one pending index step.
import { ok, type Clock, type SoftureConfig } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import { defineJobHandler, retryJobLater, type JobHandlers } from "@softure-ai/jobs";
import { enqueueJob } from "@softure-ai/jobs/server";
import type { Embedder } from "@softure-ai/llm";
import { z } from "zod";
import { createVaultStorage, readVaultStorageSettings } from "../storage/storage-settings.ts";
import { createIndexEmbedder, readEmbeddingSettings } from "./embedding-settings.ts";
import { VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE } from "./index-queues.ts";
import { runIndexStep, KEYWORD_ONLY_MODEL, type IndexLimits } from "./index-step.ts";
import { listAccountsToIndex } from "./index-store.ts";

export { VAULT_INDEX_CHECK_QUEUE, VAULT_INDEX_QUEUE, VAULT_INDEX_QUEUES, VAULT_INDEX_SCHEDULES } from "./index-queues.ts";

export interface VaultIndexDependencies {
  /** Null when the note store is not configured: there is nothing to index. */
  readonly storage: { readonly storage: FileStorage; readonly keySecret: string } | null;
  /** Null: keyword-only index. */
  readonly embedder: Embedder | null;
  readonly limits?: Partial<IndexLimits>;
}

/** The dependencies from the environment and the registered Workers AI binding. */
export function readVaultIndexDependencies(env: Readonly<Record<string, string | undefined>> = process.env): VaultIndexDependencies {
  const storage = readVaultStorageSettings(env);
  return {
    storage: storage.kind === "configured" ? { storage: createVaultStorage(storage.location), keySecret: storage.keySecret } : null,
    embedder: createIndexEmbedder(readEmbeddingSettings(env)),
  };
}

/** Enqueues an index step for the account, merged with one already pending. */
export async function enqueueVaultIndex(
  ctx: { readonly db: Queryable; readonly clock: Clock; readonly config: SoftureConfig },
  input: { readonly userId: string; readonly origin: string },
): Promise<void> {
  await enqueueJob(ctx, { queue: VAULT_INDEX_QUEUE, payload: { userId: input.userId }, dedupKey: `vault.index:${input.userId}`, origin: input.origin });
}

export function createVaultIndexJobHandlers(dependencies: VaultIndexDependencies | (() => VaultIndexDependencies)): JobHandlers {
  const resolve = typeof dependencies === "function" ? dependencies : () => dependencies;
  return {
    [VAULT_INDEX_QUEUE]: defineJobHandler({
      payload: z.object({ userId: z.uuid() }),
      run: async (payload, context) => {
        const deps = resolve();
        if (deps.storage === null) return ok();
        const result = await runIndexStep(
          {
            db: context.db,
            clock: context.clock,
            storage: deps.storage.storage,
            keySecret: deps.storage.keySecret,
            embedder: deps.embedder,
            // The continuation of a running step: no dedup key (this job still holds it).
            continueIndex: async (userId) => {
              await enqueueJob(context, { queue: VAULT_INDEX_QUEUE, payload: { userId }, origin: "vault.index-continue" });
            },
            ...(deps.limits === undefined ? {} : { limits: deps.limits }),
          },
          payload,
        );
        return result.kind === "retry" ? retryJobLater(result.error, result.retryAfterSeconds) : ok();
      },
    }),
    [VAULT_INDEX_CHECK_QUEUE]: defineJobHandler({
      payload: z.object({}),
      run: async (_payload, context) => {
        const deps = resolve();
        if (deps.storage === null) return ok();
        for (const userId of await listAccountsToIndex(context.db, deps.embedder?.modelId ?? KEYWORD_ONLY_MODEL)) {
          await enqueueVaultIndex(context, { userId, origin: "vault.index-check" });
        }
        return ok();
      },
    }),
  };
}

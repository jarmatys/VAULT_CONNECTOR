// The sync's background jobs: `vault.sync` runs one step of one account, `vault.sync-check` enqueues a step for every
// account with something to follow every five minutes (the fallback when no push arrives: NFR-5's ten minutes). A push
// (the GitHub webhook) and a change of picks enqueue a step at once. A step that copied or removed notes enqueues the
// account's index step (`vault.index`). Every enqueue for an account outside a running
// step carries the dedup key `vault.sync:<account>`, so pushes in a burst merge into one pending step.
import { ok, type SoftureConfig } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import { defineJobHandler, failJob, retryJobLater, type JobHandlerContext, type JobHandlers } from "@softure-ai/jobs";
import { enqueueJob } from "@softure-ai/jobs/server";
import type { Clock } from "@softure-ai/core";
import { z } from "zod";
import { readAccountSettings } from "../../account-settings.ts";
import { createGithubFakeFetch } from "../../auth/github-fetch.ts";
import { readDropboxFakeOrigin, readDropboxSourceSettings, readGithubSourceSettings, readHeadlessSyncSourceSettings, readS3SourceSettings } from "../settings.ts";
import { createDropboxFakeFetch } from "../sources/dropbox/dropbox-fetch.ts";
import { createSourceOpener } from "../sources/open-source.ts";
import type { VaultSource } from "../sources/source.ts";
import { enqueueVaultIndex } from "../index/index-jobs.ts";
import { NO_CAPS, type NoteCaps } from "../limits/account-limits.ts";
import type { StoredSource } from "../sources/store.ts";
import { createVaultStorage, readVaultStorageSettings } from "../storage/storage-settings.ts";
import { runSyncStep, type SyncLimits, type SyncStepResult } from "./sync-step.ts";
import { VAULT_SYNC_CHECK_QUEUE, VAULT_SYNC_QUEUE } from "./sync-queues.ts";
import { listAccountsToCheck, SYNC_TRIGGERS, type SyncTrigger } from "./sync-store.ts";

export { VAULT_SYNC_CHECK_QUEUE, VAULT_SYNC_QUEUE, VAULT_SYNC_QUEUES, VAULT_SYNC_SCHEDULES } from "./sync-queues.ts";

/** What the jobs need besides the database: the store and its key secret, and a reader for an account's source. */
export interface VaultSyncDependencies {
  /** Null when the store or the key secret is not configured: nothing is synced. */
  readonly storage: { readonly storage: FileStorage; readonly keySecret: string } | null;
  readonly openSource: (source: StoredSource) => VaultSource | null;
  readonly limits?: Partial<SyncLimits>;
  /** The plan's caps of an account (FR-18), read when a run is planned; none when absent. */
  readonly getCaps?: (ctx: JobHandlerContext, userId: string) => Promise<NoteCaps>;
  /**
   * Told how each step of an account ended, inside the job: `failed` with its code (a wait on the job's last attempt
   * too), `succeeded` when the copy matches the source (`idle`, `finished`). Other waits, a busy account, a
   * disconnected source and a continued run tell nothing.
   * The operator's alerts (VC-13) count failures in a row with it.
   */
  readonly onSyncOutcome?: (ctx: JobHandlerContext, input: { readonly userId: string; readonly outcome: SyncOutcome }) => Promise<void>;
}

/** How a step ended, as `onSyncOutcome` hears it. */
export type SyncOutcome = { readonly kind: "succeeded" } | { readonly kind: "failed"; readonly errorCode: string };

/** The dependencies from the environment: the configured store, the GitHub App, the Dropbox app and the vault keyring (S3, Dropbox and sync sources) when set. */
export function readVaultSyncDependencies(env: Readonly<Record<string, string | undefined>> = process.env): VaultSyncDependencies {
  const storage = readVaultStorageSettings(env);
  const fakeOrigin = readAccountSettings(env).githubFakeOrigin;
  const fetch = fakeOrigin === undefined ? undefined : createGithubFakeFetch(fakeOrigin);
  const dropboxFakeOrigin = readDropboxFakeOrigin(env);
  return {
    storage: storage.kind === "configured" ? { storage: createVaultStorage(storage.location), keySecret: storage.keySecret } : null,
    openSource: createSourceOpener({
      github: readGithubSourceSettings(env),
      s3: readS3SourceSettings(env),
      dropbox: readDropboxSourceSettings(env),
      headlessSync: readHeadlessSyncSourceSettings(env),
      ...(fetch === undefined ? {} : { githubFetch: fetch }),
      ...(dropboxFakeOrigin === undefined ? {} : { dropboxFetch: createDropboxFakeFetch(dropboxFakeOrigin) }),
    }),
  };
}

/** Enqueues a step for the account, merged with one already pending. */
export async function enqueueVaultSync(
  ctx: { readonly db: Queryable; readonly clock: Clock; readonly config: SoftureConfig },
  input: { readonly userId: string; readonly trigger: SyncTrigger },
): Promise<void> {
  await enqueueJob(ctx, { queue: VAULT_SYNC_QUEUE, payload: input, dedupKey: `vault.sync:${input.userId}`, origin: `vault.${input.trigger}` });
}

const syncPayload = z.object({ userId: z.uuid(), trigger: z.enum(SYNC_TRIGGERS as [SyncTrigger, ...SyncTrigger[]]) });

export function createVaultSyncJobHandlers(dependencies: VaultSyncDependencies | (() => VaultSyncDependencies)): JobHandlers {
  const resolve = typeof dependencies === "function" ? dependencies : () => dependencies;
  return {
    [VAULT_SYNC_QUEUE]: defineJobHandler({
      payload: syncPayload,
      run: async (payload, context) => {
        const deps = resolve();
        if (deps.storage === null) {
          await deps.onSyncOutcome?.(context, { userId: payload.userId, outcome: { kind: "failed", errorCode: "vault.sync_unconfigured" } });
          return failJob("vault.sync_unconfigured");
        }
        const result = await runSyncStep(
          {
            db: context.db,
            clock: context.clock,
            storage: deps.storage.storage,
            keySecret: deps.storage.keySecret,
            openSource: deps.openSource,
            // The continuation of a running step: no dedup key (this job still holds it), the account's lease keeps
            // two steps apart.
            continueSync: async (userId) => {
              await enqueueJob(context, { queue: VAULT_SYNC_QUEUE, payload: { userId, trigger: payload.trigger }, origin: "vault.continue" });
            },
            ...(deps.limits === undefined ? {} : { limits: deps.limits }),
            ...(deps.getCaps === undefined ? {} : { getCaps: (userId: string) => deps.getCaps?.(context, userId) ?? Promise.resolve(NO_CAPS) }),
          },
          payload,
        );
        const outcome = toSyncOutcome(result, { isLastAttempt: context.job.attempts >= context.job.maxAttempts });
        if (outcome !== null) await deps.onSyncOutcome?.(context, { userId: payload.userId, outcome });
        // Copies changed: index them. The dedup key merges this with a pending index step.
        if (result.kind === "continued" || result.kind === "finished") {
          await enqueueVaultIndex(context, { userId: payload.userId, origin: "vault.sync" });
        }
        return toJobResult(result);
      },
    }),
    [VAULT_SYNC_CHECK_QUEUE]: defineJobHandler({
      payload: z.object({}),
      run: async (_payload, context: JobHandlerContext) => {
        if (resolve().storage === null) return ok();
        for (const userId of await listAccountsToCheck(context.db)) {
          await enqueueVaultSync(context, { userId, trigger: "schedule" });
        }
        return ok();
      },
    }),
  };
}

/** A wait on the job's last attempt ends it failed, so it counts as a failed sync too. */
function toSyncOutcome(result: SyncStepResult, attempt: { readonly isLastAttempt: boolean }): SyncOutcome | null {
  switch (result.kind) {
    case "failed":
      return { kind: "failed", errorCode: result.error };
    case "retry":
      return attempt.isLastAttempt ? { kind: "failed", errorCode: result.error } : null;
    case "idle":
    case "finished":
      return { kind: "succeeded" };
    default:
      return null;
  }
}

function toJobResult(result: SyncStepResult) {
  switch (result.kind) {
    case "retry":
      return retryJobLater(result.error, result.retryAfterSeconds);
    case "failed":
      return failJob(result.error);
    default:
      return ok();
  }
}

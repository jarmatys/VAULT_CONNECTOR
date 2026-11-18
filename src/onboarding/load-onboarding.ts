// The facts the guided setup (onboarding-steps.ts) needs for one account, read from the vault tables and from the
// assistant access the mcp-access module keeps. A read only: nothing is written, nothing is enqueued.
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { listAccessTokens, listOAuthGrants } from "@softure-ai/mcp-access/server";
import { listSharedFolders } from "../vault/folders/shared-folders.ts";
import { getIndexProgress, type IndexProgress } from "../vault/index/index-store.ts";
import { findSource } from "../vault/sources/store.ts";
import { findLatestRun, type SyncRun } from "../vault/sync/sync-store.ts";
import type { OnboardingFacts, OnboardingSyncState } from "./onboarding-steps.ts";

export interface LoadOnboardingInput {
  readonly userId: string;
  /** The model the index is searched with on this instance (the keyword-only marker without one). */
  readonly model: string;
}

export interface LoadedOnboarding {
  readonly facts: OnboardingFacts;
  readonly latestRun: SyncRun | null;
  /** Null before any folder is shared. */
  readonly progress: IndexProgress | null;
}

export async function loadOnboarding(ctx: ModuleContext<Queryable>, input: LoadOnboardingInput): Promise<LoadedOnboarding> {
  const { db } = ctx;
  const [source, folders, latestRun, isAssistantConnected] = await Promise.all([
    findSource(db, input.userId),
    listSharedFolders(db, input.userId),
    findLatestRun(db, input.userId),
    hasAssistantReachedServer(ctx, input.userId),
  ]);
  const progress = folders.length === 0 ? null : await getIndexProgress(db, { userId: input.userId, model: input.model });
  return {
    facts: {
      hasSource: source !== null,
      sharedFolders: folders.length,
      sync: toSyncState(latestRun),
      notes: progress?.notes ?? 0,
      indexed: progress?.indexed ?? 0,
      hasIndexFailure: progress !== null && progress.failure !== null,
      isAssistantConnected,
    },
    latestRun,
    progress,
  };
}

/** Whether a connected app (an OAuth grant) or an MCP token of the account has been used at least once. */
export async function hasAssistantReachedServer(ctx: ModuleContext<Queryable>, userId: string): Promise<boolean> {
  const [grants, tokens] = await Promise.all([listOAuthGrants(ctx, userId), listAccessTokens(ctx, userId)]);
  return grants.some((grant) => grant.lastUsedAt !== null) || tokens.some((token) => token.kind === "mcp" && token.lastUsedAt !== null);
}

function toSyncState(run: SyncRun | null): OnboardingSyncState {
  return run === null ? "none" : run.status;
}

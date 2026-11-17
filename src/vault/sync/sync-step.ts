// One step of an account's sync, small enough for the background budget (45 s per tick on Workers, one subrequest per
// file read and per object written). A step takes the account's lease, plans a run when none is open, then copies or
// removes at most `maxFiles` items (stopping early after `maxMs`) and asks for its continuation while items remain. A
// step repeated after a crash redoes at most the items it had not marked done: same key, same bytes, counted once.
import type { Clock, ErrorCode } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import { listSharedFolders } from "../folders/shared-folders.ts";
import { NO_CAPS, type NoteCaps } from "../limits/account-limits.ts";
import type { SourceErrorCode, VaultSource } from "../sources/source.ts";
import { findSource, recordSourceCheck, type StoredSource } from "../sources/store.ts";
import { createAccountNoteStorage, type AccountNoteStorage } from "../storage/note-storage.ts";
import { extractNoteToc } from "../toc/note-toc.ts";
import { isEmptyPlan, MAX_NOTE_BYTES, planSync, type SyncPlan } from "./sync-plan.ts";
import {
  acquireSyncLease,
  clearSyncRequest,
  countStep,
  createRun,
  dropItem,
  findLatestRun,
  findOpenRun,
  finishRun,
  hasItems,
  hasSyncRequest,
  listCopyVersions,
  recordCopied,
  recordFailedPlan,
  recordRemoved,
  recordSyncedCursor,
  releaseSyncLease,
  requestSync,
  takeItems,
  type SyncItem,
  type SyncRun,
  type SyncTrigger,
} from "./sync-store.ts";

export interface SyncLimits {
  /** Items one step handles at most. */
  readonly maxFiles: number;
  /** A step starts no new item after this long. */
  readonly maxMs: number;
  /** Items in flight at once (source reads and storage writes). */
  readonly concurrency: number;
  readonly maxNoteBytes: number;
  /** How long a step holds the account's lease; past it a crashed step's account is free again. */
  readonly leaseMs: number;
}

export const DEFAULT_SYNC_LIMITS: SyncLimits = { maxFiles: 50, maxMs: 20_000, concurrency: 4, maxNoteBytes: MAX_NOTE_BYTES, leaseMs: 120_000 };

export interface SyncContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly storage: FileStorage;
  readonly keySecret: string;
  /** The account's source as the sync reads it; null when this instance cannot read that kind (no GitHub App, no keyring). */
  readonly openSource: (source: StoredSource) => VaultSource | null;
  /** Enqueues the account's next step. */
  readonly continueSync: (userId: string) => Promise<void>;
  readonly limits?: Partial<SyncLimits>;
  /** The plan's caps on what the account may copy, read when a run is planned; none when absent (self-hosted, tests). */
  readonly getCaps?: (userId: string) => Promise<NoteCaps>;
}

export type SyncStepResult =
  /** Nothing to do: the copy matches the source. */
  | { readonly kind: "idle" }
  /** Another step holds the account; the request is kept for when it ends. */
  | { readonly kind: "busy" }
  /** The source is disconnected: copies kept, nothing read until it is connected again. */
  | { readonly kind: "disconnected" }
  /** Items remain; the next step is enqueued. */
  | { readonly kind: "continued"; readonly runId: string }
  | { readonly kind: "finished"; readonly runId: string }
  /** The source asked to wait (rate limit, outage); the run stays open. */
  | { readonly kind: "retry"; readonly error: SourceErrorCode; readonly retryAfterSeconds: number }
  /** The run ended failed with this code. */
  | { readonly kind: "failed"; readonly error: ErrorCode };

/** The wait after a rate limit or an outage when the source names none. */
const DEFAULT_RETRY_SECONDS = 60;

export async function runSyncStep(ctx: SyncContext, input: { readonly userId: string; readonly trigger: SyncTrigger }): Promise<SyncStepResult> {
  const limits = { ...DEFAULT_SYNC_LIMITS, ...ctx.limits };
  const storage = createAccountNoteStorage(ctx.storage, ctx.keySecret, input.userId);
  const source = await findSource(ctx.db, input.userId);
  if (source === null) return removeOrphanedCopies(ctx, { ...input, storage, limits });
  if (source.status === "disconnected") return { kind: "disconnected" };
  const now = ctx.clock.now();
  const lease = await acquireSyncLease(ctx.db, { userId: input.userId, now, until: new Date(now.getTime() + limits.leaseMs) });
  if (lease === null) {
    await requestSync(ctx.db, { userId: input.userId, now });
    return { kind: "busy" };
  }
  try {
    const reader = ctx.openSource(source);
    let run = await findOpenRun(ctx.db, input.userId);
    if (run === null) {
      const planned = await planRun(ctx, { ...input, reader, syncedCursor: lease.syncedCursor, maxNoteBytes: limits.maxNoteBytes });
      if (planned.kind !== "run") {
        if (planned.result.kind === "failed") {
          await recordFailedPlan(ctx.db, { userId: input.userId, trigger: input.trigger, errorCode: planned.result.error, now: ctx.clock.now() });
        }
        return planned.result;
      }
      run = planned.run;
    }
    return await stepRun(ctx, { userId: input.userId, run, reader, storage, limits });
  } finally {
    await releaseSyncLease(ctx.db, input.userId);
  }
}

type PlanOutcome = { readonly kind: "run"; readonly run: SyncRun } | { readonly kind: "done"; readonly result: SyncStepResult };

async function planRun(
  ctx: SyncContext,
  input: { readonly userId: string; readonly trigger: SyncTrigger; readonly reader: VaultSource | null; readonly syncedCursor: string | null; readonly maxNoteBytes: number },
): Promise<PlanOutcome> {
  const picks = (await listSharedFolders(ctx.db, input.userId)).map((folder) => folder.path);
  const copies = await listCopyVersions(ctx.db, input.userId);
  if (picks.length === 0) {
    // Nothing shared: every copy goes, and the source need not be read.
    await clearSyncRequest(ctx.db, input.userId);
    const plan: SyncPlan = { copies: [], removals: [...copies.keys()], skippedTooLarge: 0, skippedNotNote: 0, skippedOverLimit: 0 };
    return isEmptyPlan(plan) ? done({ kind: "idle" }) : open(ctx, { ...input, targetCursor: null, plan });
  }
  if (input.reader === null) return done({ kind: "failed", error: "vault.sync_source_unconfigured" });
  const cursor = await input.reader.getCursor();
  if (!cursor.ok) return done(await toSourceOutcome(ctx, input.userId, cursor));
  if (cursor.value === input.syncedCursor) {
    await clearSyncRequest(ctx.db, input.userId);
    return done({ kind: "idle" });
  }
  const listing = await input.reader.listTree();
  if (!listing.ok) return done(await toSourceOutcome(ctx, input.userId, listing));
  // The request is covered from here: a request after this point gets a run of its own.
  await clearSyncRequest(ctx.db, input.userId);
  const caps = ctx.getCaps === undefined ? NO_CAPS : await ctx.getCaps(input.userId);
  const plan = planSync({ files: listing.value.files, picks, copies, maxNoteBytes: input.maxNoteBytes, caps });
  // Nothing to copy or remove: idle, unless the count over the caps changed, which a (zero-item) run records.
  if (isEmptyPlan(plan) && plan.skippedOverLimit === ((await findLatestRun(ctx.db, input.userId))?.skippedOverLimit ?? 0)) {
    await recordSyncedCursor(ctx.db, { userId: input.userId, cursor: listing.value.cursor });
    return done({ kind: "idle" });
  }
  return open(ctx, { ...input, targetCursor: listing.value.cursor, plan });
}

async function open(
  ctx: SyncContext,
  input: { readonly userId: string; readonly trigger: SyncTrigger; readonly targetCursor: string | null; readonly plan: SyncPlan },
): Promise<PlanOutcome> {
  return { kind: "run", run: await createRun(ctx.db, { ...input, now: ctx.clock.now() }) };
}

function done(result: SyncStepResult): PlanOutcome {
  return { kind: "done", result };
}

type ItemOutcome = { readonly kind: "done" } | { readonly kind: "stop"; readonly result: SyncStepResult };

async function stepRun(
  ctx: SyncContext,
  input: { readonly userId: string; readonly run: SyncRun; readonly reader: VaultSource | null; readonly storage: AccountNoteStorage; readonly limits: SyncLimits },
): Promise<SyncStepResult> {
  const { run, limits } = input;
  await countStep(ctx.db, run.id);
  const items = await takeItems(ctx.db, { runId: run.id, limit: limits.maxFiles });
  const startedAt = ctx.clock.now().getTime();
  let stop: SyncStepResult | null = null;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (stop === null && next < items.length && ctx.clock.now().getTime() - startedAt < limits.maxMs) {
      const item = items[next];
      next += 1;
      if (item === undefined) return;
      const outcome = await handleItem(ctx, { ...input, item });
      if (outcome.kind === "stop") stop ??= outcome.result;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limits.concurrency) }, worker));
  if (stop !== null) return stop;
  if (await hasItems(ctx.db, run.id)) {
    await ctx.continueSync(input.userId);
    return { kind: "continued", runId: run.id };
  }
  await finishRun(ctx.db, { runId: run.id, now: ctx.clock.now(), outcome: { kind: "succeeded" } });
  if (run.targetCursor !== null) await recordSyncedCursor(ctx.db, { userId: input.userId, cursor: run.targetCursor });
  // A push or a change of picks during the run: start the next one now instead of at the next check.
  if (await hasSyncRequest(ctx.db, input.userId)) await ctx.continueSync(input.userId);
  return { kind: "finished", runId: run.id };
}

async function handleItem(
  ctx: SyncContext,
  input: { readonly userId: string; readonly run: SyncRun; readonly reader: VaultSource | null; readonly storage: AccountNoteStorage; readonly item: SyncItem; readonly limits: SyncLimits },
): Promise<ItemOutcome> {
  const { item, run } = input;
  if (item.action === "remove") {
    await input.storage.deleteNote(item.path);
    await recordRemoved(ctx.db, { userId: input.userId, runId: run.id, path: item.path });
    return { kind: "done" };
  }
  if (input.reader === null) return fail(ctx, run, "vault.sync_source_unconfigured");
  const bytes = await input.reader.readFile({ path: item.path, version: item.version });
  if (!bytes.ok) {
    if (bytes.error === "source.not_found") {
      await dropItem(ctx.db, { runId: run.id, path: item.path, reason: "gone" });
      return { kind: "done" };
    }
    if (bytes.error === "source.too_large") {
      await dropItem(ctx.db, { runId: run.id, path: item.path, reason: "too_large" });
      return { kind: "done" };
    }
    return { kind: "stop", result: await toRunSourceOutcome(ctx, input.userId, run, bytes) };
  }
  if (bytes.value.byteLength > input.limits.maxNoteBytes) {
    await dropItem(ctx.db, { runId: run.id, path: item.path, reason: "too_large" });
    return { kind: "done" };
  }
  const text = new TextDecoder("utf-8").decode(bytes.value).normalize("NFC");
  await input.storage.putNote(item.path, bytes.value);
  await recordCopied(ctx.db, {
    userId: input.userId,
    runId: run.id,
    copy: { path: item.path, version: item.version, size: bytes.value.byteLength },
    toc: extractNoteToc(item.path, text),
    now: ctx.clock.now(),
  });
  return { kind: "done" };
}

/** Copies left behind by a source the account removed: every one goes, with no source to read. */
async function removeOrphanedCopies(
  ctx: SyncContext,
  input: { readonly userId: string; readonly trigger: SyncTrigger; readonly storage: AccountNoteStorage; readonly limits: SyncLimits },
): Promise<SyncStepResult> {
  let run = await findOpenRun(ctx.db, input.userId);
  if (run !== null && run.targetCursor !== null) {
    // A run planned against the removed source cannot read it any more.
    await finishRun(ctx.db, { runId: run.id, now: ctx.clock.now(), outcome: { kind: "failed", errorCode: "vault.sync_source_removed" } });
    run = null;
  }
  if (run === null) {
    const copies = await listCopyVersions(ctx.db, input.userId);
    if (copies.size === 0) return { kind: "idle" };
    const plan: SyncPlan = { copies: [], removals: [...copies.keys()], skippedTooLarge: 0, skippedNotNote: 0, skippedOverLimit: 0 };
    run = await createRun(ctx.db, { userId: input.userId, trigger: input.trigger, targetCursor: null, plan, now: ctx.clock.now() });
  }
  return stepRun(ctx, { userId: input.userId, run, reader: null, storage: input.storage, limits: input.limits });
}

async function fail(ctx: SyncContext, run: SyncRun, errorCode: ErrorCode): Promise<ItemOutcome> {
  await finishRun(ctx.db, { runId: run.id, now: ctx.clock.now(), outcome: { kind: "failed", errorCode } });
  return { kind: "stop", result: { kind: "failed", error: errorCode } };
}

type SourceFailureLike = { readonly ok: false; readonly error: SourceErrorCode; readonly retryAfterSeconds?: number | null };

/** A source failure before a run exists: wait and retry, mark the source disconnected, or fail. */
async function toSourceOutcome(ctx: SyncContext, userId: string, failure: SourceFailureLike): Promise<SyncStepResult> {
  if (failure.error === "source.rate_limited" || failure.error === "source.unavailable") {
    return { kind: "retry", error: failure.error, retryAfterSeconds: failure.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS };
  }
  if (failure.error === "source.disconnected") {
    await recordSourceCheck(ctx.db, { userId, now: ctx.clock.now(), outcome: { kind: "disconnected" } });
    return { kind: "disconnected" };
  }
  return { kind: "failed", error: failure.error };
}

/** A source failure inside a run: a wait keeps the run open; anything else ends it. */
async function toRunSourceOutcome(ctx: SyncContext, userId: string, run: SyncRun, failure: SourceFailureLike): Promise<SyncStepResult> {
  const outcome = await toSourceOutcome(ctx, userId, failure);
  if (outcome.kind === "retry") return outcome;
  await finishRun(ctx.db, { runId: run.id, now: ctx.clock.now(), outcome: { kind: "failed", errorCode: failure.error } });
  return outcome;
}

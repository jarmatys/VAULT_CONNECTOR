// The directory reviewer's account (VC-17, FR-21): an ordinary account with a temporary password, connected to the
// operator's read-only bucket that holds the fictional fixture vault, every top folder shared, a sync queued and the
// trial running for a fixed number of days, so a reviewer signs in once and finds a populated vault. Removing it erases
// it the way an account erases itself. The operator runs both through `npm run reviewer`.
import { createTemporaryPassword, registerUser } from "@softure-ai/auth/server";
import { users } from "@softure-ai/auth";
import { extendTrialManually } from "@softure-ai/billing/server";
import { err, ok, type FetchFunction, type ModuleContext, type Result } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { eraseUserData } from "@softure-ai/privacy/server";
import { eq } from "drizzle-orm";
import { loadFolderPicker } from "../vault/folders/load-folders.ts";
import { saveSharedFolders } from "../vault/folders/shared-folders.ts";
import type { S3SourceSettings } from "../vault/settings.ts";
import { connectS3Source, type S3ConnectInput } from "../vault/sources/s3/connect.ts";
import { createSourceOpener } from "../vault/sources/open-source.ts";
import { enqueueVaultSync } from "../vault/sync/sync-jobs.ts";

/** How long the reviewer's sign-in works when the operator names no other span. */
export const REVIEWER_DEFAULT_DAYS = 14;
/** The longest span the command grants: a reviewer account is not a free plan. */
export const REVIEWER_MAX_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_KEY = "operator:reviewer-account";

export interface ReviewerContext extends ModuleContext<Queryable> {
  readonly s3: S3SourceSettings;
  /** A fake S3 in tests. */
  readonly fetch?: FetchFunction;
}

export interface ReviewerAccountInput {
  readonly email: string;
  readonly days: number;
  readonly vault: S3ConnectInput;
}

export interface ReviewerAccount {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  /** The first instant the trial no longer covers: the sign-in stops working for the assistant after it. */
  readonly accessEndsAt: Date;
  readonly sharedFolders: readonly string[];
}

export type ReviewerErrorCode =
  | "reviewer.days_invalid"
  | "reviewer.email_taken"
  | "reviewer.registration_refused"
  | "reviewer.vault_unreachable"
  | "reviewer.vault_empty"
  | "reviewer.trial_refused";

/**
 * Creates the reviewer's account and its vault. A step that fails after the account exists erases it again, so a
 * failed run leaves nothing behind and can simply be repeated.
 */
export async function createReviewerAccount(ctx: ReviewerContext, input: ReviewerAccountInput): Promise<Result<ReviewerAccount, ReviewerErrorCode>> {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > REVIEWER_MAX_DAYS) return err("reviewer.days_invalid");
  const password = createTemporaryPassword();
  const registered = await registerUser(ctx, { email: input.email, password, hasConsented: true, clientKey: CLIENT_KEY });
  if (!registered.ok) return err(registered.error === "auth.email_taken" ? "reviewer.email_taken" : "reviewer.registration_refused");
  const userId = registered.value.user.id;

  const prepared = await prepareVault(ctx, userId, input);
  if (!prepared.ok) {
    await eraseUserData(ctx, userId);
    return prepared;
  }
  return ok({ userId, email: registered.value.user.email, password, accessEndsAt: prepared.value.accessEndsAt, sharedFolders: prepared.value.folders });
}

async function prepareVault(
  ctx: ReviewerContext,
  userId: string,
  input: ReviewerAccountInput,
): Promise<Result<{ readonly folders: readonly string[]; readonly accessEndsAt: Date }, ReviewerErrorCode>> {
  const connected = await connectS3Source({ db: ctx.db, clock: ctx.clock, settings: ctx.s3, ...(ctx.fetch === undefined ? {} : { fetch: ctx.fetch }) }, userId, input.vault);
  if (!connected.ok) return err("reviewer.vault_unreachable");

  const openSource = createSourceOpener({
    github: { kind: "unconfigured" },
    dropbox: { kind: "unconfigured" },
    headlessSync: { kind: "unconfigured" },
    s3: ctx.s3,
    ...(ctx.fetch === undefined ? {} : { s3Fetch: ctx.fetch }),
  });
  const picker = await loadFolderPicker(ctx.db, openSource, userId);
  if (picker.kind !== "ready") return err("reviewer.vault_unreachable");
  const folders = picker.tree.folders.map((folder) => folder.path);
  if (folders.length === 0) return err("reviewer.vault_empty");
  const saved = await saveSharedFolders(ctx.db, { userId, paths: folders, knownFolders: picker.tree.paths, now: ctx.clock.now() });
  if (!saved.ok) return err("reviewer.vault_unreachable");
  await enqueueVaultSync(ctx, { userId, trigger: "picks" });

  const accessEndsAt = new Date(ctx.clock.now().getTime() + input.days * DAY_MS);
  const extended = await extendTrialManually(ctx, { userId, until: accessEndsAt, adminId: null });
  if (!extended.ok) return err("reviewer.trial_refused");
  return ok({ folders: saved.value, accessEndsAt });
}

export type ReviewerRemovalErrorCode = "reviewer.not_found" | "reviewer.deletion_refused";

/** Erases the reviewer's account by its address, as the account's own deletion would. */
export async function removeReviewerAccount(ctx: ModuleContext<Queryable>, email: string): Promise<Result<string, ReviewerRemovalErrorCode>> {
  const found = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  const userId = found[0]?.id;
  if (userId === undefined) return err("reviewer.not_found");
  const erased = await eraseUserData(ctx, userId);
  return erased.ok ? ok(userId) : err("reviewer.deletion_refused");
}

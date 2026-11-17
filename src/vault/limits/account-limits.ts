// An account's plan limits as the vault reads them (FR-18): billing answers the account's state, the plan paying for
// today and the limit of every meter; the sync turns the note and storage limits into caps on what it copies, the panel
// and the status tool show them next to what the account uses.
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { getLimits } from "@softure-ai/billing/server";
import type { EntitlementStatus } from "@softure-ai/billing";
import { sql } from "drizzle-orm";
import { fromMeterLimits, type PlanLimits } from "../../lib/plans.ts";

export type LimitsContext = ModuleContext<Queryable>;

export interface AccountLimits {
  readonly status: EntitlementStatus;
  /** The plan paying for today; null on the trial, once access ended, or for paid access without a recorded grant. */
  readonly planId: string | null;
  readonly limits: PlanLimits;
}

/** What the sync may copy for an account: at most `maxNotes` notes of at most `maxBytes` in all. Null: no cap. */
export interface NoteCaps {
  readonly maxNotes: number | null;
  readonly maxBytes: number | null;
}

export const NO_CAPS: NoteCaps = { maxNotes: null, maxBytes: null };

const BYTES_PER_MIB = 1024 * 1024;

/** The account's limits; null when no account has this id. */
export async function getAccountLimits(ctx: LimitsContext, userId: string): Promise<AccountLimits | null> {
  const found = await getLimits(ctx, userId);
  if (found === null) return null;
  return { status: found.status, planId: found.planId, limits: fromMeterLimits(found.limits) };
}

/** The caps the sync applies: the plan's notes and its storage in bytes. */
export function toNoteCaps(limits: PlanLimits): NoteCaps {
  return { maxNotes: limits.notes, maxBytes: limits.storageMb === null ? null : limits.storageMb * BYTES_PER_MIB };
}

/** The account's caps, or none for an unknown account (a deleted account's sync only removes copies). */
export async function getNoteCaps(ctx: LimitsContext, userId: string): Promise<NoteCaps> {
  const found = await getAccountLimits(ctx, userId);
  return found === null ? NO_CAPS : toNoteCaps(found.limits);
}

export interface CopyTotals {
  readonly notes: number;
  readonly bytes: number;
}

/** How many notes the account has copied and their size in bytes. */
export async function getCopyTotals(db: Queryable, userId: string): Promise<CopyTotals> {
  const result = await db.execute<{ notes: string | number; bytes: string | number | null }>(sql`
    SELECT count(*) AS notes, sum(size) AS bytes FROM vault.notes WHERE user_id = ${userId}`);
  const row = result.rows[0];
  return { notes: Number(row?.notes ?? 0), bytes: Number(row?.bytes ?? 0) };
}

/** Bytes in MiB with one decimal, rounded up, so a few notes never read as 0. */
export function toMebibytes(bytes: number): number {
  return Math.ceil((bytes * 10) / BYTES_PER_MIB) / 10;
}

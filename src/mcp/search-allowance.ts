// The monthly search allowance of the account's plan (FR-15, FR-18): every `search_vault` call counts one `searches`
// against the account's calendar month in `@softure-ai/billing`, which refuses once the plan's allowance is used and says
// when the month resets. The limit comes from the account's state and plan (`src/lib/plans.ts`); `PLAN_LIMITS=unlimited`
// lifts it. The count and the search run in one transaction: a search that fails rolls its count back, so a failure
// never uses the allowance. The account's usage row stays locked for that one search, so only the same account's
// searches wait for it; the search reads through the same transaction, so a one-connection pool cannot deadlock.
import { consumeUsage, getUsage } from "@softure-ai/billing/server";
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { METERS } from "../lib/plans.ts";

export type AllowanceContext = ModuleContext<Queryable>;

export interface SearchUsage {
  readonly used: number;
  /** Null: no limit on this account. */
  readonly limit: number | null;
  readonly resetsAt: Date;
}

/** A search that ran, or the month's usage when none was left. */
export type AllowanceOutcome<T> = { readonly kind: "searched"; readonly value: T } | { readonly kind: "refused"; readonly usage: SearchUsage };

/**
 * Runs `search` if the account has a search left this month, counting it once; refused with the month's usage when
 * none is left. `search` gets the transaction's handle. When it throws, the count is rolled back and the error
 * propagates.
 */
export async function withSearchAllowance<T>(ctx: AllowanceContext, userId: string, search: (db: Queryable) => Promise<T>): Promise<AllowanceOutcome<T>> {
  return ctx.db.transaction(async (tx) => {
    const consumed = await consumeUsage({ ...ctx, db: tx }, { userId, meter: METERS.searches });
    if (!consumed.ok) {
      if (consumed.error === "billing.quota_exhausted") return { kind: "refused", usage: toSearchUsage(consumed.usage) };
      throw new Error(`Counting a search of ${userId} failed: ${consumed.error}.`);
    }
    return { kind: "searched", value: await search(tx) };
  });
}

/** The account's searches this month, its limit and when the month resets. */
export async function getSearchUsage(ctx: AllowanceContext, userId: string): Promise<SearchUsage> {
  const usage = await getUsage(ctx, { userId, meter: METERS.searches });
  if (!usage.ok) throw new Error(`Reading the search usage of ${userId} failed: ${usage.error}.`);
  return toSearchUsage(usage.value);
}

function toSearchUsage(usage: { readonly used: number; readonly limit: number | null; readonly resetsAt: Date }): SearchUsage {
  return { used: usage.used, limit: usage.limit, resetsAt: usage.resetsAt };
}

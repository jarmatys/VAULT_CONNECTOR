// The account's plan against its use, read once for the status tool and the panel's plan card: the plan in words, the
// limits of its state and plan, the copied notes and their bytes, and this month's searches.
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { PlanLimits } from "../../lib/plans.ts";
import { getSearchUsage, type SearchUsage } from "../../mcp/search-allowance.ts";
import { getAccountLimits, getCopyTotals, type CopyTotals } from "./account-limits.ts";
import { describePlanName } from "./plan-name.ts";

export interface PlanUsage {
  readonly planName: string;
  readonly limits: PlanLimits;
  readonly totals: CopyTotals;
  readonly searches: SearchUsage;
}

/** The account's plan and use; null for an account billing does not know. Reads only. */
export async function getPlanUsage(ctx: ModuleContext<Queryable>, userId: string): Promise<PlanUsage | null> {
  const account = await getAccountLimits(ctx, userId);
  if (account === null) return null;
  const [totals, searches] = await Promise.all([getCopyTotals(ctx.db, userId), getSearchUsage(ctx, userId)]);
  return { planName: describePlanName(account), limits: account.limits, totals, searches };
}

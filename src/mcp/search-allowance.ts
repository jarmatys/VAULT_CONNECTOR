// The monthly search allowance (FR-12, FR-15): every `search_vault` call counts one request per account in
// `@softure-ai/metering`, which refuses a search once the month's budget is used and says when it resets. The limit is
// one default for every account (`SEARCHES_PER_MONTH`, 1,000 when unset; 0 stops search) until plans carry their own
// (VC-14); the operator can also change it at runtime with metering's `setBudgetLimit`, without a deploy. A reservation
// is settled after the search and released when the search failed, so a failure never uses the allowance.
import type { ProviderDefinitionInput } from "@softure-ai/metering";
import { getSpend, releaseSpend, reserveSpend, settleSpend, type MeteringContext } from "@softure-ai/metering/server";

export const SEARCH_PROVIDER = "vault-search";
export const SEARCHES_PER_MONTH_ENV = "SEARCHES_PER_MONTH";
export const DEFAULT_SEARCHES_PER_MONTH = 1000;
/** Metering's ceiling for an amount or a limit. */
const MAX_LIMIT = 1e15;
/** Charges are kept a little over a year, so a month's use can be explained later; metering's floor is 32 days. */
export const SEARCH_CHARGES_KEEP_DAYS = 400;

type Environment = Readonly<Record<string, string | undefined>>;

/** The configured monthly limit: a whole number from 0 up, else the default. */
export function readSearchesPerMonth(env: Environment): number {
  const raw = env[SEARCHES_PER_MONTH_ENV]?.trim();
  if (raw === undefined || raw === "" || !/^\d+$/.test(raw)) return DEFAULT_SEARCHES_PER_MONTH;
  return Math.min(Number(raw), MAX_LIMIT);
}

/** The metering provider for `metering({ providers })`: requests, one budget per account and month. */
export function searchMeteringProvider(env: Environment): ProviderDefinitionInput {
  return { id: SEARCH_PROVIDER, unit: "requests", budgets: [{ period: "month", limit: readSearchesPerMonth(env), perAccount: true }] };
}

export interface SearchUsage {
  readonly used: number;
  readonly limit: number;
  readonly resetsAt: Date;
}

/** A search that ran, or the month's usage when none was left. */
export type AllowanceOutcome<T> = { readonly kind: "searched"; readonly value: T } | { readonly kind: "refused"; readonly usage: SearchUsage };

/**
 * Runs `search` if the account has a search left this month, counting it once; refused with the month's usage when
 * none is left. When `search` throws, the reservation is released and the error propagates.
 */
export async function withSearchAllowance<T>(ctx: MeteringContext, userId: string, search: () => Promise<T>): Promise<AllowanceOutcome<T>> {
  const reserved = await reserveSpend(ctx, { provider: SEARCH_PROVIDER, amount: 1, step: "search", accountId: userId });
  if (!reserved.ok) {
    const { budget } = reserved;
    return { kind: "refused", usage: { used: budget.spent, limit: budget.limit, resetsAt: budget.resetsAt } };
  }
  let value: T;
  try {
    value = await search();
  } catch (error) {
    await releaseSpend(ctx, reserved.value);
    throw error;
  }
  await settleSpend(ctx, reserved.value, 1);
  return { kind: "searched", value };
}

/** The account's searches this month, its limit and when the month resets. */
export async function getSearchUsage(ctx: MeteringContext, userId: string): Promise<SearchUsage> {
  const spend = await getSpend(ctx, { provider: SEARCH_PROVIDER, period: "month", accountId: userId });
  if (!spend.ok) throw new Error(`Reading the search usage of ${userId} failed.`);
  return { used: spend.value.spent, limit: spend.value.limit ?? 0, resetsAt: spend.value.resetsAt };
}

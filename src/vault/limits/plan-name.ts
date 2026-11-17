// The account's plan in words, the same in the panel and the status tool: the paid plan's name, else its state.
import { en } from "../../messages/en.ts";
import type { AccountLimits } from "./account-limits.ts";

const PLAN_NAMES: Readonly<Record<string, string>> = en.plans;

export function describePlanName(account: Pick<AccountLimits, "status" | "planId">): string {
  if (account.status === "paid" && account.planId !== null) return PLAN_NAMES[account.planId] ?? en.status.planNames.paid;
  return en.status.planNames[account.status];
}

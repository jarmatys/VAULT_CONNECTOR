// An account whose access has ended (FR-19): billing's `read_only` state, on an instance that enforces plans. The tools
// answer with the product's website instead of note content, the copies and the index stay for the grace period
// (`GRACE_DAYS`) and are then removed (lapsed-copies.ts). A self-hosted instance (`PLAN_LIMITS=unlimited`) never ends
// access, whatever billing's trial says.
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { getEntitlement } from "@softure-ai/billing/server";
import { GRACE_DAYS, isPlanLimited } from "../../lib/plans.ts";

type Environment = Readonly<Record<string, string | undefined>>;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EndedAccess {
  /** When access ended. */
  readonly since: Date;
  /** When the grace period ends: from then the copies and the index are removed. */
  readonly removeAt: Date;
  /** Whether the grace period is over. */
  readonly isPastGrace: boolean;
}

/** The end of the grace period of access that ended at `since`. */
export function getRemovalDate(since: Date): Date {
  return new Date(since.getTime() + GRACE_DAYS * DAY_MS);
}

/** When the account's access ended and its grace period; null while it has access, or on an unlimited instance. */
export async function findEndedAccess(ctx: ModuleContext<Queryable>, userId: string, env: Environment = process.env): Promise<EndedAccess | null> {
  if (!isPlanLimited(env)) return null;
  const entitlement = await getEntitlement(ctx, userId);
  if (entitlement?.status !== "read_only") return null;
  const removeAt = getRemovalDate(entitlement.since);
  return { since: entitlement.since, removeAt, isPastGrace: ctx.clock.now().getTime() >= removeAt.getTime() };
}

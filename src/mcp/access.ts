// The tools once an account's access has ended (FR-19): instead of note content, `vault_index`, `get_note` and
// `search_vault` answer with the payment page and what happens to the copies (kept until the grace period ends, then
// removed); `vault_status` adds the same line. Nothing changes while the account has access, or on an instance without
// plans (`PLAN_LIMITS=unlimited`).
import { formatMessage } from "@softure-ai/core";
import { en } from "../messages/en.ts";
import { BILLING_PATH } from "../panel-paths.ts";
import { findEndedAccess, type EndedAccess } from "../vault/limits/ended-access.ts";
import type { VaultReadContext } from "./vault-tools.ts";

const copy = en.mcp.answers;

/** The sentence an assistant gets once the account's access ended; null while it has access. */
export async function explainEndedAccess(ctx: VaultReadContext, userId: string): Promise<string | null> {
  const ended = await findEndedAccess({ db: ctx.db, clock: ctx.clock, config: ctx.config }, userId);
  return ended === null ? null : describeEndedAccess(ended, `${ctx.config.appOrigin}${BILLING_PATH}`);
}

/** The pointer to the payment page, with the day the copies go (or went). */
export function describeEndedAccess(ended: EndedAccess, paymentUrl: string): string {
  return ended.isPastGrace
    ? formatMessage(copy.accessEndedRemoved, { endedOn: formatDay(ended.since), paymentUrl })
    : formatMessage(copy.accessEnded, { endedOn: formatDay(ended.since), removedOn: formatDay(ended.removeAt), paymentUrl });
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

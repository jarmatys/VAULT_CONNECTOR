// The tools once an account's access has ended (FR-19): instead of note content, `vault_index`, `get_note` and
// `search_vault` answer with the product's website and what happens to the copies (kept until the grace period ends,
// then removed); `vault_status` adds the same line. Nothing changes while the account has access, or on an instance
// without plans (`PLAN_LIMITS=unlimited`). The pointer is the site's home page, never the payment page: an assistant's
// directory may forbid linking to a checkout from inside the assistant (ChatGPT's does, VC-19, FR-25).
import { formatMessage } from "@softure-ai/core";
import { en } from "../messages/en.ts";
import { findEndedAccess, type EndedAccess } from "../vault/limits/ended-access.ts";
import type { VaultReadContext } from "./vault-tools.ts";

const copy = en.mcp.answers;

/** The sentence an assistant gets once the account's access ended; null while it has access. */
export async function explainEndedAccess(ctx: VaultReadContext, userId: string): Promise<string | null> {
  const ended = await findEndedAccess({ db: ctx.db, clock: ctx.clock, config: ctx.config }, userId);
  return ended === null ? null : describeEndedAccess(ended, ctx.config.appOrigin);
}

/** The pointer to the product's website, with the day the copies go (or went). */
export function describeEndedAccess(ended: EndedAccess, siteUrl: string): string {
  return ended.isPastGrace
    ? formatMessage(copy.accessEndedRemoved, { endedOn: formatDay(ended.since), siteUrl })
    : formatMessage(copy.accessEnded, { endedOn: formatDay(ended.since), removedOn: formatDay(ended.removeAt), siteUrl });
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

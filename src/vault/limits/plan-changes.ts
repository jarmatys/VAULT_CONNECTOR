// A change of the account's access (a plan granted or refunded, a trial extended) can change its caps, while the
// source has not moved: the sync would see the same cursor and plan nothing. This asks for a full re-plan instead; the
// five-minute check starts it.
import type { OnAccessChanged } from "@softure-ai/billing";
import { requestSync } from "../sync/sync-store.ts";

export const requestFullSync: OnAccessChanged = async (event, ctx) => {
  await requestSync(ctx.db, { userId: event.accountId, now: ctx.clock.now(), resetCursor: true });
};

# Plan: account-pays-for-plan

## Approach
Wire the billing module's payment parts into the app instead of building any: `stripe()` as the payment adapter on
the hosted version (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `STRIPE_API_BASE` only for the e2e's fake), the
payment page in the panel at `/panel/billing`, the admin page at `/admin/billing`, the webhook at
`/api/billing/webhook`, the access badge and notice in the panel, and billing's reminder mail on the job runner. When
access has ended (`read_only`) on an instance that enforces plans, `vault_index`, `get_note` and `search_vault` answer
with the payment page's address and the day the copies go, and `vault_status` says the same. Thirty days (placeholder)
after access ended, a daily job removes the account's copies and index; the source and the picks stay, so a payment
copies everything back. A self-hosted instance (`PLAN_LIMITS=unlimited`) gets no payment, no plan screen, no gate and
no purge.

## Decisions (auto)
- Prepaid periods on Stripe Checkout, no subscriptions (research).
- Payment page at `/panel/billing` (inside the panel frame, heading from the page) so Checkout returns to a signed-in
  screen; admin at `/admin/billing` next to jobs and alerts.
- `GRACE_DAYS = 30` in `src/lib/plans.ts`, a placeholder next to the prices.
- The gate lives in `src/mcp/access.ts` (`findAccessEnded`): one read of the entitlement per call; `vault_status` keeps
  answering with an extra line, the other three tools answer only the pointer.
- The purge (`src/vault/limits/lapsed-copies.ts`, queue `vault.purge-lapsed`, daily) reuses the erasure queue; caps of
  0 for a lapsed account keep the sync from copying back; billing's `onAccessChanged` re-plans the sync after payment.
- The e2e's fake Stripe joins `e2e/fake-services.mjs` (checkout session, hosted page, signed webhook), modelled on the
  SOFTURE example app's; app-local like the fake S3 and Dropbox.
- Reminder mail: billing's own template and schedules (`billingJobSchedules`, `createBillingJobHandlers`).
- No new migration: the purge deletes rows of existing tables.

## Phases
1. **Payment wiring** (test-after): `createPaymentProvider` and `GRACE_DAYS` in `src/lib/plans.ts`, billing routes and
   adapter in `softure.config.ts`, payment, admin and webhook routes, the panel's "Plan" section (hidden when
   unlimited), badge and notice, reminder jobs. Done when unit tests cover the provider choice and the sections, and
   typecheck and lint are green.
2. **Tools point to payment** (TDD): `src/mcp/access.ts`, the four tools. Done when MCP tests show a read-only account
   gets the payment address from `vault_index`, `get_note` and `search_vault`, `vault_status` adds the line, a paid or
   unlimited account reads as before.
3. **Grace-period purge** (TDD): lapsed caps, the purge job and its schedule. Done when tests show copies kept inside
   the grace period, removed (rows, index, queued objects) after it, not copied back by a sync, and copied back after a
   payment; an unlimited instance purges nothing.
4. **e2e through a fake Stripe** (test-after): fake Stripe in `e2e/fake-services.mjs`, `e2e/billing.spec.ts`. Done when
   the e2e pays the monthly plan on the fake Checkout and the panel shows paid access; evidence screenshot.
5. **Close**: docs (`docs/deployment.md` Stripe steps), `.env.example`, gates, impl review, archive.

## Progress
- [x] Phase 1: payment wiring (13fb9fa)
- [x] Phase 2: tools point to payment (13fb9fa)
- [x] Phase 3: grace-period purge (13fb9fa; `src/vault/limits/lapsed-copies.test.ts` 6/6)
- [x] Phase 4: e2e through a fake Stripe (e695cbf; `e2e/billing.spec.ts`, runs in CI on both hosts)
- [x] Phase 5: close (7ef9098; gates green: 421 tests; impl review approved)

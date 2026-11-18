---
change_id: account-pays-for-plan
verdict: approved
---

# Implementation review

- Drift from plan: none in scope. No migration was needed: the grace period reads billing's `read_only_since`
  (`getEntitlementStatesSql`), and the purge removes rows the vault already owns. Payment is prepaid periods on
  `stripe()` (one Checkout payment buys a month or a year), so the module needed no change in SOFTURE/AI.
- Payment: `createBillingOptions` adds `stripe()` only on an instance that enforces plans (`STRIPE_API_BASE` points it at
  a fake); billing's routes are mounted at `/panel/billing` (`PaymentPage` with the panel's heading), `/admin/billing`
  (`BillingAdminPage`: grants and refunds) and `/api/billing/webhook` (`stripeWebhookRoute`). The panel shows billing's
  access badge and its access notice; a self-hosted instance (`PLAN_LIMITS=unlimited`) shows neither, and its plan
  screen answers 404.
- Access ended: `vault_index`, `get_note` and `search_vault` answer with the payment page's URL and the removal date
  instead of note content; `vault_status` adds the same line. A grant reads again at once (MCP endpoint tests). Billing's
  trial does not end access on an unlimited instance (`findEndedAccess` is gated on `isPlanLimited`).
- Grace period: copies and index stay for `GRACE_DAYS` (30, a placeholder) after access ends. The daily
  `vault.purge-lapsed` job then removes copies, passages and index state, queues the objects for `vault.erase-copies`,
  and keeps the source, the picks and the run history; the account's sync caps become `LAPSED_CAPS` (0, 0), so nothing
  is copied back until a payment, whose `onAccessChanged` re-plans the full sync (tests in
  `src/vault/limits/lapsed-copies.test.ts`). `deleteVaultUserData` now reuses the same removal (account deletion tests
  still green).
- E2E: `e2e/billing.spec.ts` registers, orders the monthly plan, pays on the fake Stripe in `e2e/fake-services.mjs`
  (signed `checkout.session.completed` to the app's webhook) and sees paid access in the panel, on Node and on workerd.
  It runs in CI only: this container has no Postgres with pgvector. Evidence is the CI run of the pull request.
- Deploy: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are required Worker secrets in `wrangler.jsonc`, passed by
  name in `release.yml`, stood in for in `deploy-dry-run.yml`, listed in `.env.example` and `docs/deployment.md`
  (owner steps, step 7). No real deploy, no Stripe call.
- Accepted: after the purge, a sync whose source did not change records no new run, so the latest run still shows the
  trial's copy count; the panel's access notice says why nothing is shared, so no extra signal is added.
- Gates: `npm run typecheck`, `npm run lint`, `npm test` (52 files, 421 tests) green at 7ef9098.

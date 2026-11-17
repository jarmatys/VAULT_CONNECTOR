# Research: account-pays-for-plan

## What exists (master 2a45f38)
- `@softure-ai/billing` 0.11.3 is already in `softure.config.ts` (VC-14): a 14-day trial, `paid` and `readOnly` limits
  and two plans (`monthly`, `yearly`) with placeholder prices in `src/lib/plans.ts`; no `payment` adapter, no routes
  mounted. `PLAN_LIMITS=unlimited` lifts every limit (self-hosted).
- The package already ships everything payment needs: `stripe()` (Stripe Checkout, one-time payments, BLIK, cards,
  transfers; `apiBase` for a test stand-in), `stripeWebhookRoute` (grant on a paid checkout, take back on a refund,
  exactly once), `PaymentPage` (plans, order, checkout button), `BillingAdminPage` (grant a plan, extend a trial,
  account history, revoke a manual grant), `CurrentAccessBadge` / `CurrentAccessNotice`, reminder mail and its daily
  job (`createBillingJobHandlers`, `billingJobSchedules`), `getEntitlement` and `getEntitlementStatesSql` for the app's
  own SQL. Refunds of Stripe payments happen at Stripe; the webhook takes the access back.
- `onAccessChanged` already re-plans the account's sync (`requestFullSync`), so a payment restores the caps.
- MCP tools (`src/mcp/vault-tools.ts`): `vault_index`, `get_note`, `search_vault`, `vault_status`. Read-only state
  today: copies kept within the trial caps, 0 searches; `vault_index` and `get_note` still answer.
- Sync caps (`getNoteCaps`) drop shared notes over the caps; caps of 0 drop all of them, so nothing is copied back.
- Deleting an account (`deleteVaultUserData`) queues object keys for `vault.erase-copies` and deletes the vault rows;
  the same erasure queue serves a purge of copies.
- The proxy guards only `/panel` and `/admin`; `/api/billing/webhook` stays public.
- e2e fakes live in `e2e/fake-services.mjs` (one port, 127.0.0.1); `stripe()` calls `new URL("/v1/...", apiBase)`, so
  a fake answers at the origin's root; the checkout URL is accepted when the fake is plain HTTP on a loopback host.
  The SOFTURE example app has a fake Stripe (`examples/next-app/e2e/fake-stripe-server.mjs`) to model on.

## Unknowns answered
- Recurring subscriptions vs prepaid periods: prepaid. `stripe()` buys one period per checkout, a renewal is a new
  payment, the reminder mail warns before the end. No change in SOFTURE/AI is needed; recurring billing would be a
  package change of its own and is not required by FR-19 ("pays monthly or yearly … keeps access for the paid period").
- Prices and currency (OQ-2): stay placeholders in `src/lib/plans.ts` (EUR 5 / EUR 50) until the owner sets them.
- Grace period: the PRD names none; a placeholder of 30 days in `src/lib/plans.ts`, counted from when access ended
  (`Entitlement.since`).

## Risks
- Self-hosted instances keep billing's trial: after 14 days they would turn read-only. The access gate and the purge
  must apply only when plans are enforced (`isPlanLimited`).
- A purge that relied on the sync would need a working source; the purge removes copies directly instead.

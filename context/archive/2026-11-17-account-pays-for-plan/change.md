---
change_id: account-pays-for-plan
title: "An account pays for a plan"
status: archived
roadmap_item: VC-15
branch: claude/project-thread-6pss8w
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
A new account starts on a trial; the payment page sells a monthly and a yearly plan on the product's site; a paid checkout extends access by its period; when access ends the tools answer with a pointer to the payment page, data is kept for a grace period and then removed; the admin grants and refunds. Ends `done_code`: live payments wait for the owner's payment account and prices.

## Context
Roadmap item VC-15 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-15: An account pays for a plan
> - **Change ID:** `account-pays-for-plan`
> - **Status:** ready
> - **Outcome:** a new account starts on a trial; the payment page sells a monthly and a yearly plan on the product's
>   site; a paid checkout extends access by its period; when access ends the tools answer with a pointer to the payment
>   page, data is kept for a grace period and then removed; the admin grants and refunds. Ends `done_code`: live payments
>   wait for the owner's payment account and prices.
> - **Prerequisites:** VC-14
> - **Touches (estimate):** `src/app/(panel)/billing/**`, `src/app/api/billing/**`, `src/app/(admin)/billing/**`,
>   `src/mcp/access.ts`, `src/jobs/handlers.ts` (grace-period purge), `softure.config.ts` (billing payment adapter).
> - **Unknowns:**
>   - Recurring subscriptions versus prepaid periods with the billing module's Stripe adapter (one-time checkouts today);
>     if recurring is required, extend the module in SOFTURE/AI. (owner: research; blocks: no)
>   - Prices and currency (OQ-2). (owner: owner; blocks: no)
> - **Risk:** gate 2; after the MVP flow so payment is never the first thing that breaks.
> - **Baseline:** no payment; after: e2e pays through a fake Stripe, access extends; an expired account gets the pointer.
> - **PRD refs:** FR-19, G-4

Findings gathered while recording the roadmap:

- `@softure-ai/billing` 0.11.x: trial and paid entitlements, `stripe()` adapter on Stripe Checkout (one-time payments) and `stripeWebhookRoute`, `manual()`, plans with period `month`/`year`. ChatGPT forbids selling inside the app; payment lives on the product's site.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/app/(panel)/billing/**`, `src/app/api/billing/**`, `src/app/(admin)/billing/**`, `src/mcp/access.ts`, `src/jobs/handlers.ts` (grace-period purge), `softure.config.ts` (billing payment adapter).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Done
- VC-15: payment for the plans through `@softure-ai/billing`'s `stripe()` (prepaid periods: one Checkout payment buys a
  month or a year), on an instance that enforces plans only. The panel's Plan screen (`/panel/billing`) sells the
  monthly and yearly plans, the panel shows the account's access and a notice when it is ending or ended,
  `/admin/billing` grants and refunds, `/api/billing/webhook` takes Stripe's signed events. Once access ends the tools
  answer with the payment page and the removal date; the copies and the index stay for `GRACE_DAYS` (30) and the daily
  `vault.purge-lapsed` job removes them after that, keeping the source and the picks, and a payment copies everything
  back. Unit and MCP tests on PGlite; e2e pays through a fake Stripe on both hosts in CI.
- Owner step: on the product's own Stripe account, a restricted key as `STRIPE_SECRET_KEY` and a webhook endpoint
  `https://<APP_DOMAIN>/api/billing/webhook` (events `checkout.session.completed`, `charge.refunded`) whose signing
  secret is `STRIPE_WEBHOOK_SECRET`, both in the `production` environment's secrets (the Worker requires them;
  `docs/deployment.md`, Owner steps 7); set the prices in `src/lib/plans.ts` and, if 30 days is wrong, `GRACE_DAYS`.

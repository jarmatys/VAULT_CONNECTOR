# Implementation review: two-minute-onboarding (VC-12)

Reviewed: 2026-11-17, against `plan.md` and `change.md`. Verdict: **approve** after one fix (applied).

## Plan conformance

- Phase 1: `src/onboarding/onboarding-steps.ts` (pure step model) and `load-onboarding.ts` (facts from the vault
  tables and mcp-access grants and tokens) as planned; 17 unit tests.
- Phase 2: the overview renders `src/components/panel/Onboarding.tsx` (the theme's `Steps`, `MiniProgress`,
  `CodeBlock` and the kit's new `CopyButton`, theme-notion 0.24.0); the sentence form posts to the overview's own
  action; `PanelRefresher` reads the page again every 3 s while the index fills. The overview's test ids and labels
  used by the older specs are kept (`panel-source`, `panel-folders`, `panel-status`, the "Next step" region).
- Phase 3: `src/jobs/vault-kick.ts` runs the sync and index queues once after the folder save (`after()`), under its
  own worker name and lease owner; failures are logged, never shown.
- Phase 4: the fake S3 gained a writable mode (tested against the app's S3 driver), the fake services serve it at
  `/store`, both Playwright configs set the note store, and `e2e/onboarding.spec.ts` times sign-up to the first
  `search_vault` answer.

## Findings

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | On an instance without a note store the overview would wait (and refresh every 3 s) forever after a pick, since no copy ever starts. | Fixed: the page refreshes only when the store is configured. |
| 2 | Suggestion | The kick claims any account's due vault jobs, not only the saver's. | Accepted: same handlers and leases as the tick, it only does the tick's work sooner. |
| 3 | Suggestion | `e2e/accounts.ts` reports `no-unsafe-*` when linted alone. | Pre-existing (not touched here); `npm run lint` is green. |

## Evidence

- Unit: `npx vitest run src/onboarding src/jobs/vault-kick.test.ts src/components/panel src/vault/testing` green.
- e2e on Node (local Postgres 16 with pgvector, `npm run build`): onboarding, connector, folders, source and accounts
  specs, 12 green; onboarding 6.6 s from sign-up to the first answer.
- e2e on workerd (`npm run build:cloudflare`, `playwright.workers.config.ts`): onboarding, folders and connector, 6
  green; onboarding 9.6 s. `wrangler dev` runs no cron, so the index finishing proves the after-pick kick.
- Screenshots (project files, `vault-connector/evidence/two-minute-onboarding/`): `01-overview-after-new-*`,
  `02-overview-after-index-*`, `03-overview-after-complete-*`, each at 1280 light and 390 dark.

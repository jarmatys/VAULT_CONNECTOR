# Research: plan-limits-enforced

## Today
- Search allowance (VC-11): `src/mcp/search-allowance.ts` counts one request per `search_vault` call in
  `@softure-ai/metering` (provider `vault-search`, one per-account month budget, `SEARCHES_PER_MONTH`, default 1,000).
  Reserve before, settle after, release on failure. `vault_status` prints the month's use from `getSpend`.
- Sync (VC-8): `planSync` (`src/vault/sync/sync-plan.ts`) takes the source listing, the picks and the copies and plans
  copies and removals; it skips notes over 1 MiB and non-notes and counts both on the run
  (`vault.sync_runs.skipped_too_large`, `skipped_not_note`). Planning happens once per run in `sync-step.ts` `planRun`;
  an unchanged source cursor plans nothing (`idle`).
- Index (VC-10): indexes exactly the rows of `vault.notes` (the copies), so a note that is not copied is not indexed.
- Embeddings: `createIndexEmbedder` builds a `@softure-ai/llm` embedder for the index jobs and the search; calls carry
  `attributes: { userId }`; nothing records their use.
- Panel status screen (`src/app/(panel)/panel/status/page.tsx`, `VaultStatus.tsx`): sync card and index card, theme-notion
  parts (`Card`, `DetailTable`, `MiniProgress`, `Status`).
- `@softure-ai/billing` is not installed. 0.11.3 on npm: plans in config with `limits` per meter, limits per state
  (`trial.limits`, `paid.limits`, `readOnly.limits`, `free.limits`), `getLimits(ctx, userId)` answers
  `{ status, planId, limits }`, `consumeUsage` counts a meter per calendar month atomically and refuses with
  `usage.resetsAt`, `getUsage` reads it. Runs on Workers (runtime-providers roadmap). Usage rows go with the account
  (privacy contributor). `onAccessChanged` hook after grants, refunds and trial extensions.
- `@softure-ai/metering` 0.4.2: `recordCharge` records spend after the fact, per account, with a step and attributes;
  `getSpend`/`getSpendBreakdown` read it. Provider units include `tokens`.

## Touches
`softure.config.ts` (billing module, metering providers), `src/lib/plans.ts` (new), `src/vault/limits/**` (new),
`src/vault/sync/sync-plan.ts`, `sync-step.ts`, `sync-store.ts`, `sync-jobs.ts`, `src/jobs/handlers.ts`, a vault
migration (`skipped_over_limit`), `src/mcp/search-allowance.ts`, `src/mcp/vault-tools.ts`, `src/mcp/read-context.ts`,
`src/vault/index/embedding-settings.ts`, `index-jobs.ts`, `src/app/(panel)/panel/status/page.tsx`,
`src/components/panel/VaultStatus.tsx`, `src/messages/en.ts`, `docs/deployment.md`, `.env.example`, tests and e2e.

## Risks
- Migration number: VC-21 runs in parallel with `0007`; whoever merges second renumbers (coordinator rule).
- Holding a transaction during a search: the usage row of one account stays locked for the search; only that account's
  searches wait. The search runs on the same transaction handle, so a one-connection pool cannot deadlock.
- Self-hosted instances must not be limited (free, AGPL): one switch turns every limit off.
- A limit change (plan granted) with an unchanged source would not re-plan: billing's `onAccessChanged` asks for a
  full re-plan.

## SOFTURE modules
billing (plans, limits, usage) and metering (embedding spend) cover the need; no package gap found.

---
change_id: plan-limits-enforced
verdict: approved
---

# Implementation review

- Drift from plan: none in scope. The migration is `0008_add_skipped_over_limit.sql`, since VC-21 took `0007` on master
  first. The plan card and the status tool read the same loader (`src/vault/limits/plan-usage.ts`), so they cannot
  disagree.
- Plans: limits and the plan state come from `@softure-ai/billing` (trial, paid plans, read-only after access ends),
  configured in `src/lib/plans.ts`. Values and prices are placeholders marked for the owner; `PLAN_LIMITS=unlimited`
  lifts every limit for a self-hosted instance. No hand-written plan table was added.
- Notes and storage: the sync plans within the caps (existing copies first, then the rest by path, first fit), so notes
  over the caps are neither copied nor indexed, and copies over a lowered cap are removed. The count left out is stored
  on the run (`skipped_over_limit`, a `CHECK (>= 0)`), and a changed count opens a run even with nothing to copy, so the
  panel and `vault_status` stay current. A granted plan asks for a full re-plan through billing's `onAccessChanged`
  (tested: the rest is copied without waiting for a push).
- Searches: `consumeUsage` counts one search per call, atomic per account; past the allowance the call is refused with
  the reset date while `vault_index` and `get_note` keep working (end to end over MCP). The count and the search share
  one transaction, so a failed search does not use the allowance. Accepted: the account's usage row stays locked while
  its own query is embedded, so only that account's concurrent searches wait.
- Embedding spend: every successful embedding call records its input tokens in metering under the account and the step
  (`index`, `search`); failed calls and calls without an account record nothing (unit tests). Accepted: a search whose
  ranking fails after the query was embedded rolls its spend record back with the transaction; the gap is one short
  query per failure, and moving the record out of the transaction would deadlock a one-connection pool.
- Known limit, left to VC-15: billing's trial ends in the read-only state, whose search allowance is 0, until payment
  exists. The panel names the state ("Access ended").
- Tests: unit (plans, sync caps, limits through the jobs, allowance, spend), MCP end to end, component (plan card
  states), e2e (`e2e/status.spec.ts`, run in CI on Node and Workers). Gates: typecheck, lint, 408 unit tests green.
- UI: the card is built from existing theme-notion parts (`Card`, `Status`, `MiniProgress`, `DetailTable`); no new
  component, so nothing goes to the kit. Evidence:
  `vault-connector/evidence/plan-limits-enforced/01-status-plan-card-after-1280-light.webp` (project files).
- Public repository: no addresses, keys or personal data in the diff; test accounts are fictional.

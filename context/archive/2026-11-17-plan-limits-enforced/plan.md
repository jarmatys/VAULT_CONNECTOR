# Plan: plan-limits-enforced

## Approach
Adopt `@softure-ai/billing` for plans and their limits, with three meters: `notes` (notes copied), `storage-mb`
(MiB of copied notes) and `searches` (a month). The trial, the read-only state and two placeholder plans (monthly,
yearly) carry the limits in `src/lib/plans.ts`, the one place the owner edits values and prices (OQ-2).
`PLAN_LIMITS=unlimited` lifts every limit (self-hosted). The sync reads the account's limits when it plans a run and
keeps the shared notes that fit (copies it already has first, then by path), counts the rest on the run
(`skipped_over_limit`) and removes copies over the limit, so the index never sees them. Search counts the `searches`
meter in billing (replacing VC-11's metering budget) inside a transaction, so a failed search uses nothing. Metering
stays for embedding spend: every embedding call records its input tokens per account. The panel's status screen gets a
plan card (usage against each limit, the over-limit note) and `vault_status` the same lines.

## Decisions (auto)
- Billing over a hand-written plan table: FR-18 names it, VC-15 builds payment on the same plans.
- Meters: `notes`, `storage-mb`, `searches`. Notes and storage are caps on what is copied (read from `getLimits`), not
  monthly counters; searches are counted with `consumeUsage`.
- Placeholder values (owner sets real ones with prices): trial 14 days, 5,000 notes, 500 MiB, 1,000 searches;
  monthly and yearly 20,000 notes, 2,000 MiB, 5,000 searches; read-only keeps the trial's note and storage caps
  (data stays) and 0 searches; prices EUR 5.00 a month and EUR 50.00 a year, marked as placeholders. No payment
  provider and no billing page yet (VC-15).
- `PLAN_LIMITS=unlimited` gives `null` (no limit) for every meter in every state; anything else enforces.
- Which notes fit: notes the account already has a copy of first (no churn when a note is added), then the rest, each
  group by path; a note fits when the count stays within `notes` and the summed size within `storage-mb`.
- A plan with nothing to copy or remove but a changed over-limit count still opens a (zero-item) run, so the count the
  panel shows stays true.
- `SEARCHES_PER_MONTH` and the `vault-search` metering provider go; metering keeps provider `vault-embeddings`
  (`tokens`, no budget), step `index` or `search`, attribute `model`.
- Plan change: billing's `onAccessChanged` asks the account's sync to re-plan (`requestSync` with `resetCursor`).
- Migration `0008_add_skipped_over_limit.sql` (renumbered from 0007 after VC-21 took it).

## Phases
1. **Plans and limits** (TDD): `src/lib/plans.ts` (billing options, meters, `PLAN_LIMITS`), billing in
   `softure.config.ts`, `getAccountLimits` in `src/vault/limits/`. Done when tests show a trial account's limits, a
   granted plan's, a read-only account's and the unlimited switch.
2. **Sync keeps to the caps** (TDD): `planSync` limits, migration, run column, `planRun` reads limits, jobs wire them,
   `onAccessChanged` re-plans. Done when sync tests show notes over the count and over the storage are not copied (and
   not indexed), existing copies win over new ones, a lowered limit removes copies, the count is on the run, and a
   raised limit after a grant copies the rest.
3. **Search on the plan** (TDD): `search-allowance.ts` on billing, `vault_status` lines. Done when MCP tests refuse a
   search past the plan's allowance with the reset date while `vault_index` and `get_note` work, a failed search does
   not count, unlimited never refuses, and status shows notes, storage and searches against the plan.
4. **Embedding spend** (TDD): `onUsage` recorder on the embedder. Done when a test indexes notes and searches with a
   fake model and finds the tokens recorded per account and step.
5. **Panel** (test-after): plan card on the status screen. Done when a component test and the e2e show usage against
   limits and the over-limit note; screenshot as evidence.
6. **Close**: docs, `.env.example`, gates, impl review, archive.

## Progress
- [x] Phase 1: plans and limits (c3ef438)
- [x] Phase 2: sync keeps to the caps (c3ef438; migration renumbered to 0008 after merging master, bee1f63)
- [x] Phase 3: search on the plan (c3ef438)
- [x] Phase 4: embedding spend (c3ef438)
- [x] Phase 5: panel (fd360ca; evidence `vault-connector/evidence/plan-limits-enforced/01-status-plan-card-after-1280-light.webp`)
- [x] Phase 6: close (4478d38 docs; typecheck, lint and 408 unit tests green; e2e in CI)

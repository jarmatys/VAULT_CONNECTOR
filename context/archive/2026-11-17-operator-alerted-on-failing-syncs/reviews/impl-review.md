---
change_id: operator-alerted-on-failing-syncs
verdict: approved
---

# Implementation review

- Plan drift: none. Phase 1 and 2 as planned; the SOFTURE/AI gap (a Worker's scheduled handler exported nothing) was
  fixed there as observability 0.8.7 (`withScheduledObservability`) and is used in `worker.ts`.
- Correctness: `recordSyncOutcome` upserts the streak and fires on exactly the third failure in the same transaction,
  so a crash cannot send an alert without the count or count without the alert's delivery jobs. A refused alert
  throws (a bug, never a user error). A success deletes the row and resolves only when an alert was fired (≥ 3).
- Tests: fake time drives every case through `runDueJobs` as the worker runs them, with exact delivery lists; the
  last-attempt retry, an unconfigured store, two accounts, a reset streak and below-three cases are covered; the
  heartbeat counts its lines; the Grafana rule's query is pinned; the admin e2e checks 404 without the role on both
  pages and the pages with it.
- Security and privacy: admin pages behind `requireRole("admin")` and the proxy; alert key and text carry the account
  id only (a test asserts no address); the webhook channel accepts https only; secrets come from the environment.
- Migration: additive, own `operator` schema, foreign key with cascade, rollback stated.
- Deploy: four new required secrets in `wrangler.jsonc`, `release.yml` and the dry run (guard test green);
  `OTEL_RESOURCE_ATTRIBUTES` sets the environment label the rule reads.

- Fixed in review: importing `@softure-ai/auth/next` in `softure.config.ts` broke `softure migrate` and the Node
  worker (plain Node cannot resolve `next/headers`); the panel guard now imports it lazily (`src/admin-guard.ts`).
  Verified: `npm run migrate` and `node scripts/worker.ts` load the config; `e2e/admin.spec.ts` green locally on Node.

Verdict: approved, no open findings.

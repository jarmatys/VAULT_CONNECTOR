# Research: The hosted product is checked end to end (VC-23)

## What already measures a goal
- **G-2 (two-minute onboarding):** `e2e/onboarding.spec.ts` times sign-up → GitHub source → pick → index → connector →
  first `search_vault` answer, records `onboarding-ms` as a test annotation and fails above 120 s. It runs in CI on Node
  (`checks.yml` e2e), on workerd (`e2e-workers`) and on the compose stack (`self-host.yml`), against fake GitHub.
- **NFR-1 (search p95):** `src/vault/index/search-performance.test.ts` inserts 5,000 notes straight into the tables and
  times `rankPassages`, not the tool; the table of contents and reading a note (< 1 s) are not measured anywhere.
- **NFR-2 (isolation):** `src/mcp/mcp-endpoint.test.ts` proves it on two accounts through the real endpoint (OAuth,
  bearer token, every tool, probes aimed at the other account and at the unpicked folder).
- **NFR-5 (sync delay):** nothing measures it. The design: `vault.sync-check` every 5 minutes enqueues a step per
  account (`src/vault/sync/sync-queues.ts`), the Cron Trigger ticks once a minute (`wrangler.jsonc`), a GitHub push
  enqueues at once (`github-webhook.ts`), a finished step enqueues the index step.
- **G-3 (directory checklist):** `content/docs/directory-checklist.md` has seven rows with evidence paths; a docs test
  holds the paths to existing files. No count against the target "7 / 7".
- **G-5 (self-host):** `self-host.yml` brings up `docker-compose.yml` and runs the whole e2e suite; nothing records it
  as the goal's yes/no.

## Reusable pieces
- `src/mcp/testing/vault-fixture.ts`: accounts, fake source, picks, sync through the jobs and index on PGlite.
- The OAuth connect pattern of `mcp-endpoint.test.ts` (register, consent, PKCE exchange) with `createMcpEndpoint` and
  `createVaultServerFactory`.
- `runDueJobs` (jobs/testing) enqueues due schedules and drains queues on the test clock: the hosted tick on a
  simulated minute.
- Playwright's JSON reporter carries the `onboarding-ms` annotation.

## Risks
- 5,000 notes synced and indexed through the jobs on PGlite may take minutes: acceptable for an on-demand measurement,
  so the measurements stay out of `npm test`.
- Measured on fakes (fake model, fake GitHub, PGlite or CI Postgres), not on the hosted production: a gap to record,
  since deploying is the owner's step.

## SOFTURE modules
None needed: no product behaviour, no UI. No kit change.

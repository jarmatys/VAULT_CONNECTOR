# Plan: operator-alerted-on-failing-syncs

## Approach
The sync handler reports each step's outcome to `recordSyncOutcome`, which keeps a per-account streak in
`operator.sync_failure_streaks`: the third failure in a row fires one `@softure-ai/alerts` alert (`vault.sync:<id>`),
later failures only count, and the next good sync resolves it (one recovery). Failed jobs, failing or late schedules
and paused queues of the other queues come from `alertsFromJobs`. A one-minute `operator.heartbeat` schedule logs
`jobs heartbeat`; `grafana/alert-rules.json` fires when that line is absent for 10 minutes. `/admin/jobs` and
`/admin/alerts` are the packages' pages behind the admin role.

## Decisions (auto)
- A separate `operator` schema and module for the streak table: it stays out of the vault migrations other lanes
  number, and is dropped with the account (foreign key, cascade).
- Keys and details carry the account id, never an address (NFR on personal data in alerts).
- Only the third failure alerts; a retry still pending on the job's last attempt counts as one failed sync; an
  unconfigured store counts (`vault.sync_unconfigured`); idle and finished steps count as good.
- `vault.sync` is in `ignoreQueues` of `alertsFromJobs`, so a failed step never alerts on its own.
- A dead tick is detected outside the app: the heartbeat line plus a Grafana silence rule; the Worker's scheduled
  handler is wrapped with `withScheduledObservability` (SOFTURE/AI fix, observability 0.8.7) and the Node worker
  starts observability as `vaultconnector-jobs`.
- Channels: mail to `ALERTS_MAIL_TO` always, a webhook when `ALERTS_WEBHOOK_URL` is an https URL. Admins from
  `ADMIN_EMAILS`. `ALERTS_MAIL_TO`, `ADMIN_EMAILS`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` are
  required secrets of the release.
- The Grafana contact point and `npm run grafana:alerts` are the owner's step (their account).

## Phases
1. **Streak and alert** (TDD): migration, module, `recordSyncOutcome`, handler hook. Done when tests with fake time
   show one alert on the third failure, none after, one recovery on the next good sync, accounts counted apart, a reset
   after a good sync, and nothing below three.
2. **Wiring**: alerts module and channels, jobs hooks, admin pages and proxy, heartbeat, Node and Workers
   observability, Grafana rules, secrets in `wrangler.jsonc`, release and dry run, `docs/deployment.md`. Done when the
   heartbeat test logs three lines in three minutes, the rules test pins the query, the deploy guards pass and the
   admin e2e shows 404 without the role and both pages with it.
3. **Close**: impl review, archive.

## Progress
- [x] Phase 1: streak and alert (`src/jobs/alerts.test.ts` 6 sync tests green)
- [x] Phase 2: wiring (alerts.test.ts 9, grafana-alert-rules.test.ts 4, proxy.test.ts 4, wrangler.test.ts 27 green;
  `e2e/admin.spec.ts` on both hosts in CI)
- [x] Phase 3: close (typecheck, lint, `npm test` green; reviews/impl-review.md approved)

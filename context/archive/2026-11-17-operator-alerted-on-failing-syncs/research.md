# Research: operator-alerted-on-failing-syncs

## What exists (master after VC-8)
- `src/vault/sync/sync-jobs.ts`: the `vault.sync` queue's handler runs one step (`runSyncStep`) and maps its result
  to the job outcome; a failed plan is stored on `vault.sync_runs`, but `recordFailedPlan` skips a repeated identical
  failure, so counting failed rows would undercount a streak.
- `softure.config.ts`: `jobs()` with the sync queue and the five-minute check; `auth()` without an admin list; no
  alerts module; no admin pages; the proxy protects only the panel.
- `worker.ts` (Workers): `fetch` is wrapped by `withObservability`; the `scheduled` export (the jobs tick) is not, so
  on Workers nothing the tick logs is exported. `scripts/worker.ts` (Node) does not start observability either.

## SOFTURE modules
- `@softure-ai/alerts` 0.2.3: `alert`/`resolveAlert` with dedup by key (repeats counted, one recovery on resolve),
  delivery on the jobs queue `alerts.deliver` to `mailChannel` and `webhookChannel`; `alertsFromJobs` turns jobs'
  hooks (failed job, a schedule that turns failing or late, a paused queue) into alerts, with `ignoreQueues`;
  `AlertsPage` behind a `panelGuard`.
- `@softure-ai/jobs` 0.1.11: `JobsPage` (`/admin/jobs` by default) behind a `panelGuard`; `checkJobsTickHealth` and
  `jobs.worker_heartbeats` exist on Workers only, and a tick that does not run cannot alert through a job.
- `@softure-ai/auth`: `adminEmails`, `requireRole`/`authorizeRole` from `/next`, roles in `auth.user_roles`.
- `@softure-ai/observability`: `withObservability` (fetch only on Workers), `startObservability` (Node), Grafana rule
  builders (`buildServiceSilentRule`, `buildLogProblemsRule`) and `softure-observability grafana apply`.
  Gap: no wrapper for a Worker's `scheduled` handler. Fixed in SOFTURE/AI (observability 0.8.7,
  `withScheduledObservability`).

## Unknowns answered
- "No successful jobs tick for 10 minutes": cannot be told from inside the app (alert delivery is itself a job).
  A heartbeat schedule logs one `jobs heartbeat` line a minute on both hosts, and a Grafana rule fires on ten minutes
  of silence. The owner applies the rule (the backend account is theirs).
- Three failed syncs in a row: a dedicated streak row per account, counted in the sync handler's transaction.

## Risks
- jobs' per-job hook would alert on the first failed sync step: the sync queue is excluded from it.
- Alert text must not carry an address: the key and details name the account id only.

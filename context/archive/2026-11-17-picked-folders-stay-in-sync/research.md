# Research: picked-folders-stay-in-sync

## What exists (master after VC-7)
- `VaultSource` (`src/vault/sources/source.ts`): `getCursor`, `listTree` (path, version = blob sha, size), `readFile`
  (one blob, capped), `listChangesSince`. The git adapter spends two calls on a listing (head commit, recursive tree)
  and one per file; every installation has its own GitHub rate limit (5,000 an hour).
- `vault.sources` (one per account) and `vault.shared_folders` (minimal set of picks). `isPathShared` and `isNotePath`
  (`src/vault/folders/`) are the one set of note and ignore rules; the sync reuses them.
- No jobs runner, no object storage, no webhook route yet. `@softure-ai/security` 0.2.9 is installed and exports
  `handleWebhook` with the GitHub sender preset (signature over raw bytes, delivery id recorded once).

## SOFTURE modules
- `@softure-ai/jobs` 0.1.11: queues and schedules in Postgres; on Workers `createScheduledHandler` runs one
  `runJobsTick` per Cron Trigger minute (budget 45 s, jobs keep their leases past it); on Node
  `runJobWorkerProcess`. `runDueJobs` (`/testing`) runs due jobs in a test. Handlers run at least once, so the sync step
  must be idempotent.
- `@softure-ai/files` 0.5.2: storage drivers behind one interface (`put`, `get`, `head`, `delete`): `createS3Storage`
  (R2 through the S3 API, SigV4 with `node:crypto`, keys from the environment per request), `createLocalStorage`
  (self-hosted volume), `createMemoryStorage` (tests). The module's own table (`files.files`, owner and id keyed) is not
  needed: the sync needs keys it derives itself, one object per note path, overwritten in place.
- No package gap found: nothing to change in SOFTURE/AI for this item.

## Unknowns answered
- **Job size.** The tick's budget is 45 s and, on Workers, one invocation also has a subrequest limit (each GitHub
  blob read and each R2 write is one). A step copies at most 50 files with 4 reads in flight and stops early after
  20 s, then enqueues its own continuation, which the same tick claims while budget remains. 5,000 notes are 100
  steps; the fixture test counts them and checks no step goes over 50 files. Cloudflare Queues are not needed: the
  job table keeps up (one row per step).
- **Table of contents.** Postgres (`vault.notes`): VC-9 filters and sorts it per folder and VC-10 joins notes to their
  passages; one object per account would have to be read whole for every question.

## Risks
- A webhook for every push could pile up jobs: a dedup key per account (`vault.sync:<user>`) merges them while one is
  pending, and a lease on the account's source row keeps two steps of one account from running at once.
- Last change per note: GitHub gives a file's last commit only with one call per file. The sync records the moment it
  stored a new version instead (`changed_at`), which is what "the copy changed" means to the tools.

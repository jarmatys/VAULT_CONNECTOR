# Plan: picked-folders-stay-in-sync

## Approach
A resumable sync per account, run as `vault.sync` jobs of `@softure-ai/jobs`. A step takes the account's lease, plans
a run when none is open (list the tree, keep the picked notes, diff against `vault.notes` by version, write the work
as `vault.sync_items`), then copies or removes up to 50 files into object storage, updates the table of contents row
of each, and enqueues its continuation until the run is done. A push webhook and a five-minute check enqueue the
step; saving picks asks for a full diff. Storage keys are `v1/<prefix>/<sha256(path)>`, the prefix an HMAC-SHA256 of
the account id under `VAULT_STORAGE_KEY_SECRET`.

## Decisions (auto)
- Storage: `@softure-ai/files` drivers only (R2 through S3, a folder when self-hosted, memory in tests); settings
  `VAULT_S3_ENDPOINT`, `VAULT_S3_BUCKET`, `VAULT_S3_REGION`, `VAULT_S3_ACCESS_KEY_ID`, `VAULT_S3_SECRET_ACCESS_KEY` or
  `VAULT_STORAGE_DIR`, and `VAULT_STORAGE_KEY_SECRET` (at least 32 characters). Without them nothing is enqueued and a
  step fails `vault.sync_unconfigured`. Placeholders only; the owner creates the bucket and the secret.
- Notes over 1 MiB and non-note files inside picked folders are skipped and counted on the run (FR-7); never an error.
- A deleted source (or no picks) removes every copy; a disconnected source keeps the copies and runs nothing until it
  is connected again.
- A run lists the whole tree (two calls) instead of `listChangesSince`: the diff by version copies only what changed,
  and a pick change or a missed webhook can never leave a hole. A step first compares the head commit with the last
  synced one and stops there when nothing moved (one call).
- Source failures: rate limit and outage retry after the source's hint; disconnected marks the source and ends the run;
  too large or unreadable answers fail the run with its code (the panel shows it in VC-13).
- Table of contents per note: path, title (frontmatter `title`, else the first `#` heading, else the file name), tags,
  aliases, description (`description`, else `summary`), size, `changed_at`. A small frontmatter reader for those keys;
  no YAML dependency.
- Jobs on Workers from a Cron Trigger every minute (`worker.ts` `scheduled`); on Node `scripts/worker.ts`. Queue
  `vault.sync` (concurrency 2, lease 120 s), schedule `vault.sync-check` every 5 minutes.
- Webhook `POST /api/webhooks/github` (`GH_WEBHOOK_SECRET`): a push to a connected source's branch enqueues its sync;
  other events answer 200 and do nothing.

## Phases
1. **Storage, table of contents and schema** (TDD): migration 0003 (`vault.notes`, `vault.sync_runs`,
   `vault.sync_items`, source columns `synced_cursor`, `sync_requested_at`, `sync_lease_until`), storage settings and
   keys, frontmatter reader. Done when unit tests show a key holds neither the account id nor the path, two accounts get
   different prefixes, a wrong-length secret is refused, and the title, tags, aliases and description rules hold
   (inline and block lists, quotes, missing frontmatter, BOM, CRLF).
2. **The sync step** (TDD): plan, batch, finish, lease, continuation, failures. Done when tests on a test database with
   a fake source and memory storage show: first sync copies only picked notes and counts skipped files; a changed,
   added, removed and renamed note follows; unpicking removes copies and rows; another account untouched; a step never
   copies more than 50 files; a 5,000-note vault completes in 100 steps through `runDueJobs`; a push seen by the
   five-minute check appears within 10 minutes of fake time; no storage key contains an account id; rate limit retries;
   disconnected marks the source.
3. **Wiring**: jobs module and handlers, `worker.ts` scheduled export and cron, `scripts/worker.ts`, webhook route,
   picks save requests a sync, `.env.example`, `wrangler.jsonc` secrets, release and dry-run secret names,
   `docs/deployment.md`. Done when the webhook test signs a push and sees exactly one job per matching source, a bad
   signature gets 401, and the deploy guards pass.
4. **Close**: impl review, archive, roadmap row via the coordinator's merge.

## Progress
- [x] Phase 1: storage, table of contents and schema (note-toc 8 and note-storage 4 tests green)
- [x] Phase 2: the sync step (sync.test.ts 18 tests green; mutation check red then restored)
- [x] Phase 3: wiring (github-webhook.test.ts 5 tests green; `npm run build:cloudflare` and `wrangler deploy --dry-run` green)
- [x] Phase 4: close (typecheck, lint, `npm test` 163 tests green; reviews/impl-review.md approved)

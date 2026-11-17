---
change_id: picked-folders-stay-in-sync
verdict: approved
---

# Implementation review

- Drift from plan: none in scope. Two additions on the way: `@softure-ai/security`'s ready-made prune jobs
  (`securityJobHandlers`, `securityJobSchedules`) run on the new jobs module, so the webhook delivery ids the GitHub
  webhook records stay bounded; and `isNotePath` now refuses dot-file names (`Projects/.hidden.md`), which a copy
  would otherwise have stored although the folder picker never counted them.
- Core rule: only notes in picked folders are copied (tested with notes outside every pick, non-notes and an oversized
  note, all counted, none stored); no pick means no copy; unpicking or deleting the source removes the copies; a
  disconnected source keeps them until the account acts.
- Isolation: every query names `user_id` or a run of the account; keys are `v1/<HMAC prefix>/<sha256(path)>` and carry
  neither the account id nor the path (tested); another account's copies stay untouched when one account changes.
- Workers budget: at most 50 files and 20 s per step, a lease of 120 s per account, a continuation enqueued without a
  dedup key; 5,000 notes finish in 100 steps (tested). `wrangler deploy --dry-run` bundles `worker.ts` with the
  scheduled handler; `npm run build:cloudflare` green.
- Webhook: signature, size limit and replays are `handleWebhook`'s; only a push to a connected repository's default
  branch enqueues, inside the delivery's transaction (tested: one job per following account, a replay adds none, a bad
  signature answers 401, another branch or a ping enqueues nothing).
- Failures: rate limits and outages retry with the source's hint; a disconnected source is recorded; a failed listing
  finishes the run as failed once (repeated failures are not duplicated); an instance without a store fails the job
  with `vault.sync_unconfigured` and the five-minute check enqueues nothing.
- Mutation check: breaking the plan's pick filter and the removal of unpicked copies turned the sync tests red; the code
  was restored.
- Gates: typecheck, lint (with the language gate) and `npm test` (22 files, 163 tests) green.

Verdict: approved.

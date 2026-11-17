---
change_id: account-exports-and-deletes-data
verdict: approved
---

# Implementation review

- Drift from plan: none in scope. One addition: the erase job takes only keys queued at least `ERASE_DELAY_SECONDS`
  ago (`listQueuedErasures` with `queuedBefore`), because the hourly schedule could otherwise drain a fresh deletion's
  keys while a sync step was still in flight; the test caught it (the copies went before the delay).
- Core rule and isolation: the deletion and the export name the account in every query; the test deletes one of two
  fictional accounts and checks every `user_id` column in every schema, the store under both prefixes and both tokens
  through `/api/mcp` (the deleted one 401, the other still reads its notes).
- Rollback safety: objects are never deleted inside the privacy transaction; the queue table holds only object keys
  (HMAC prefix and path hash), so it keeps nothing that names the deleted account or its notes.
- Secrets: the export leaves out the sealed S3 key pair, the PKCE verifier and the GitHub installation ids; the test
  asserts no note text, title or installation field is in the file.
- Failure paths: a failing store retries with the keys kept; no store fails the job (the operator's job alerts see it)
  with the keys kept; no key secret at deletion queues nothing (no copy can exist) and still deletes every row.
- Known limit, recorded as a follow-up: an account created by GitHub sign-in has no password it knows; the screen sends
  it to "Forgot password" first. A password-free confirmation belongs in `@softure-ai/privacy`.
- Gates: typecheck, lint, `npm test` 42 files / 333 tests; Node e2e `account-privacy.spec.ts` and `accounts.spec.ts`
  5/5 against a local Postgres 16 with pgvector; workerd e2e in CI.

Verdict: approved.

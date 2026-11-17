# Plan review: release-deploys-to-cloudflare (VC-4)

- Verdict: approved, with the findings below folded into the plan.
- Scope matches `change.md` (owned files) plus two shared, append-only touches: `softure.config.ts` (the `backup()`
  module, needed or the backup run fails on a missing `backup.runs`) and `vitest.config.mts` (`scripts/**/*.test.ts`).
  `package.json`/lockfile gain one dependency; conflicts with parallel items are additive.
- F1 (accepted): the baseline asks for "the `deploy-cloudflare` action in test mode", which does not exist; the plan's
  dry run runs the real action with a wrapper in dry-run mode, which covers more (tag check, build, migrate, verify).
- F2 (accepted): wrangler's dry run ignores `secrets.required`; the wrapper checks it, with a unit test.
- F3 (accepted): scheduled backups would fail nightly before production exists; gated on `PRODUCTION_LIVE`.
- F4 (accepted): restore target must have pgvector; `pgvector/pgvector:pg17`.
- F5 (accepted): every pin and `deploy-cli-version` move together; a guard test fails on a moving ref.
- Evidence named for every phase (local dry run and verify, unit tests, CI runs).

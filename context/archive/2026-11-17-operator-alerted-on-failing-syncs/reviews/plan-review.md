---
change_id: operator-alerted-on-failing-syncs
verdict: approved
---

# Plan review

- Scope matches change.md and FR-27: three failed syncs in a row and a dead tick each give one alert and one
  recovery; admin-only health page; rules as code. Applying the rules is the owner's step (change.md, Unknowns).
- Double alerting: jobs' `onJobFailed` would fire per failed sync step; the plan excludes `vault.sync` from it.
- Counting: `sync_runs` cannot be the counter (repeated identical failures are not stored); a streak table is.
  The write happens in one transaction with the alert's delivery jobs.
- A retry that never succeeds must count once, at the job's last attempt; added to phase 1.
- Migration: additive, own schema, rollback stated.
- Secrets: the new names go through `wrangler.jsonc`, `release.yml` and the dry run together (guard test).

Verdict: approved with the last-attempt case added.

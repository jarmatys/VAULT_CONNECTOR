---
change_id: picked-folders-stay-in-sync
verdict: approved
---

# Plan review

- Scope matches change.md and FR-7: copies under a hashed prefix, webhook and scheduled check, only what changed,
  skipped and counted files, unpicked copies removed, table of contents rebuilt. Showing the counts in the panel and
  alerting on failures belong to VC-10 and VC-13; the run rows they read are written here.
- Isolation (NFR-2, NFR-4): every query names `user_id`; keys come from an HMAC of the id, never the id, and hash the
  path; a test asserts no key contains an account id. Added to phase 2: another account's copies untouched.
- At-least-once handlers: a step repeated after a crash re-copies the same version (same key, same bytes) and deletes
  only its own item rows, so it is idempotent. The lease prevents two steps of one account overlapping; added to
  phase 2: a second step while the lease is held asks for a later run instead of working.
- Background budget: the per-step cap (50 files, 20 s) is what the 5,000-note test checks by count; real timing on
  Workers is VC-23's measurement.
- Migration: additive, forward only, rollback stated in the file.
- Secrets: new names reach the release through `wrangler.jsonc`, `release.yml` and the dry run together (the guard
  test compares them).

Verdict: approved with the two phase 2 cases above.

---
change_id: account-picks-shared-folders
verdict: approved
---

# Plan review

- Scope matches change.md and FR-8's first and second acceptance lines: tree with counts, nothing ticked, ticking
  saves exactly the picked set, unticking removes the folder from the set. Removing copies and index of an unticked
  folder (FR-8's third line) belongs to VC-8 and VC-10, which read this set; nothing to remove exists yet.
- Core rule: nothing shared before a pick holds by construction (empty table, no default). A crafted form posting a
  path outside the tree is refused; added to phase 1 tests: a path with `..`, a leading slash and a dot folder.
- Isolation: every query names `user_id`; the table references the account and the source with cascades; a test that
  another account's picks stay untouched is in phase 1.
- Contracts: `isPathShared` and the ignore rules are the API VC-8 needs; the plan keeps both in `src/vault/folders/`.
- Migration: additive, forward only, rollback stated in the file.
- Workers: the screen uses only the adapter and the request database; e2e runs on both hosts.

Verdict: approved with the extra phase 1 cases above.

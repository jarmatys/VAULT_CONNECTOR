---
change_id: account-picks-shared-folders
verdict: approved
---

# Implementation review

- Drift from plan: none. The checkbox is `@softure-ai/ui`'s `Checkbox` with the theme's `CHECKBOX_LOOK`; it carries no
  value of its own, so a ticked folder posts a field named `folder:<path>` (`readPostedFolders`).
- Core rule: nothing shared before a pick (no default row); a pick is checked against the tree read again at save time,
  so a crafted form cannot share a path the account never saw; the database refuses dot folders and malformed paths as
  a second line (tested).
- Isolation: every query names `user_id`; another account's picks stay untouched (tested); picks go with the source
  and when the repository changes (tested).
- Correctness: the e2e first passed the second save before its redirect (the saved message from the first save was
  still on the page); fixed by reopening the picker before unticking. Repeated three times green.
- Workers: the screen uses the adapter and the request database only; e2e on workerd runs in CI.
- Gates: typecheck, lint, the vault unit tests (40) and the Node e2e of the folders and source specs green.

Verdict: approved.

---
change_id: account-connects-git-source
verdict: approved
---

# Plan review

- Scope matches change.md: one repository, read-only, panel names it, revocation shows as disconnected, the source
  interface with git first. Lane B paths only, plus the additive `softure.config.ts` entry and the panel home link.
- Contracts between phases: phase 2 uses the adapter only for the repository check, so phase 1's interface is not
  bent by the flow; VC-7 reads `listTree`, VC-8 `listChangesSince` and `readFile`.
- Security: the forged `installation_id` is the main risk; the plan accepts a link only after the user's own token
  reaches the installation, on a one-time state bound to the account. Added: the setup route must refuse a state of
  another account, and the callback must re-check that the state row has an installation id (no skip of the setup
  step). Both in phase 2's tests.
- Isolation: `vault.sources.user_id` references `auth.users` with `ON DELETE CASCADE`, so deleting an account leaves no
  source row (VC-16 builds on it).
- Test gaps: a renamed file in `listChangesSince`, a compare beyond 300 files, a truncated tree; all in phase 1.
- Workers: the adapter uses `requestJson`/`requestBytes` only; the routes run on both hosts in phase 3's e2e.

Verdict: approved with the two additions above, applied to phase 2.

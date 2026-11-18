# Plan: an account that signs in with GitHub only deletes itself

## Phases

### Phase 1: adopt the packages

- Bump auth and privacy; the account page passes the re-authentication prop; the workaround copy goes.
- e2e `e2e/account-privacy.spec.ts`: the GitHub-only flow (aged sign-in refused, Confirm with GitHub, deletion).
- Done when: typecheck, lint and unit tests pass; the e2e suite runs in the PR's checks.

## Progress

- [x] Phase 1: adopt the packages

# Plan: sources-use-user-oauth

## Phases
1. Switch Dropbox and GitHub to the package, remove the local helpers; a test for the token endpoint's codes. Done when
   typecheck, lint and `src/vault/sources` tests are green.
2. Bump `@softure-ai/connections` to 0.8.0 once published; CI green.

## Progress
- [x] Phase 1: `npx vitest run src/vault/sources` 11 files green (Dropbox 31 tests); `npx tsc --noEmit`, eslint clean.
- [x] Phase 2: `@softure-ai/connections` ^0.8.0 in package.json and the lockfile.

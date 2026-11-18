---
change_id: github-account-deletes-itself
title: "An account that signs in with GitHub only deletes itself"
status: archived
archived_at: 2026-11-18
roadmap_item: null
issue: null
branch: claude/project-thread-13du28
created: 2026-11-18
updated: 2026-11-18
---

## Intent

An account created by a GitHub sign-in (no password its owner knows) deletes itself on the account screen by
confirming with a fresh GitHub sign-in; the "set a password first" workaround goes.

## Context

Follow-up of VC-16. `@softure-ai/privacy` 0.2.3 confirmed a deletion only with the current password, so the account
screen told GitHub-only accounts to set a password through the reset link first. The fix landed in the packages:
`@softure-ai/auth` 0.2.18 (`findRecentProviderSignIn`) and `@softure-ai/privacy` 0.2.4 (the form's
`reauthentication` prop, `privacy.reauthentication_required`).

## Scope

- Bump `@softure-ai/auth` ^0.2.18 and `@softure-ai/privacy` ^0.2.4.
- Account screen: pass `getDeleteAccountReauthentication(ACCOUNT_PATH)` to `DeleteAccountForm`; drop the
  `account.githubPassword` note and its link.
- e2e: a GitHub-only account whose sign-in is twenty minutes old is refused without a password, confirms with
  GitHub, comes back to the account screen and deletes itself.

## Notes

- Research and frame skipped: the cause and the fix are the package change's; this change only adopts it.

## Decisions (auto)

- Default window (10 minutes) kept; no product reason to change it.

---
change_id: fix-flaky-sync-key-test
title: "Sync key test no longer fails at random on a chance hash match"
status: archived
roadmap_item: null
issue: 64
branch: claude/project-thread-nq0c1v
created: 2026-11-27
updated: 2026-11-27
archived_at: 2026-11-27
---

## Intent

`src/vault/sync/sync.test.ts` › "writes keys that hold neither the account id nor a note path" gives the same result
on every run, as issue #64 asks.

## Context

The test checked that no dash-separated part of the random account UUID appears in any storage key. A 4-hex part
matches somewhere in a 96-hex key in roughly one run out of several hundred, so the test failed on PR #63, which
changed no code. The key code (`src/vault/storage/note-storage.ts`) is correct: the account prefix is an HMAC under
the key secret and the note segment a SHA-256 of the path.

## Notes

- Research and frame skipped: a test-only fix whose cause and direction are stated in issue #64; findings in plan.md.
- No release, no deploy.

## Done

- The test now asserts the exact set of keys: `getNoteKey(deriveAccountPrefix(SECRET, id), path)` for the picked
  notes, plus that the prefix is not the raw id, and keeps the shape and full-id checks. Nothing in it depends on the
  random UUID's digits.
- Seen red: with the prefix replaced by the raw id, the test fails.

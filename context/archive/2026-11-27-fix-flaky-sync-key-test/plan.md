# Plan: fix-flaky-sync-key-test

## Findings

- Cause: `for (const part of aliceId.split("-")) expect(key).not.toContain(part)` checks 4-hex parts against 96 hex
  characters of hash; a chance match is about 1 in several hundred runs (#64, run 45969659581).
- The code under test is right; only the assertion is probabilistic.

## Phases

### Phase 1: deterministic assertion

- `src/vault/sync/sync.test.ts`: compare the stored keys with the keys the layout must produce for the picked notes
  (`deriveAccountPrefix`, `getNoteKey`), check the prefix is not the raw id, keep the shape and full-id checks, drop
  the per-part substring check.
- Done when: the file passes, the test fails when the prefix is replaced by the raw id, typecheck, lint and the pull
  request's checks are green.

## Progress

- [x] Phase 1: assertion rewritten; `npx vitest run src/vault/sync/sync.test.ts` 18/18 green; mutation (prefix = raw
  id) fails the test; typecheck and lint green.

## Decisions (auto)

- Fixed account id rejected: the exact-key comparison proves more (the prefix is the keyed HMAC) and keeps the test's
  accounts created the usual way.

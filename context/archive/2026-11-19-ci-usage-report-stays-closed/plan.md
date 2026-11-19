# Plan: ci-usage-report-stays-closed

## Phases

### Phase 1: caller passes close-issue

- `.github/workflows/ci-usage.yml`, `scripts/deploy/release-workflows.test.ts`.
- Done when: the release-workflows test is green and the workflow passes actionlint in CI.

## Progress

- [x] Phase 1: pin 54df49a and `close-issue: true` (see the commit; `vitest run scripts/deploy/release-workflows.test.ts` green)

## Decisions (auto)

- Pin to the merge commit of SOFTURE/AI#1396, the commit that last changed the reusable workflow, as before.

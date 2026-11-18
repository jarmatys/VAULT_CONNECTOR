# Plan: ci-usage-report

One phase, test-after: add the caller workflow, extend the workflow guard with the ci-usage pin and a test of the
schedule, permissions and the absence of secrets. Gates: typecheck, lint, the unit suite. Done when the pull request's
checks are green and, after the merge, a manual run of `ci-usage` publishes the `CI usage report` issue.

## Progress

- [x] Phase 1: `.github/workflows/ci-usage.yml` added; `release-workflows.test.ts` guards it (seen red with
  `issues: read`, green with the real file).

# Plan: ci-minutes-optimisation

One phase, test-after, since the change is workflow files and the guard that reads them: write `e2e.yml` (Node and
Workers e2e, the dry run in the Workers job), slim `checks.yml` to one static job with the scan, drop push and add the
documentation skip in `self-host.yml`, call `e2e.yml` from `release.yml`, add the cached Playwright action, delete
`deploy-dry-run.yml`, update the docs that name it. Gates: typecheck, lint, unit suite, `actionlint` on the workflows.
Done when the pull request's own run of `e2e.yml` (it touches workflows, not only docs) is green, including the dry run
on the second database.

## Progress

- [x] Phase 1: workflows rewritten; `scripts/deploy/release-workflows.test.ts` guards the release gate, the push
  rule, the documentation skip and the cached Playwright install (red on `measure.yml` until it used the action).

# Implementation review: ci-minutes-optimisation

Verdict: approve.

- `actionlint` 1.7.7 reports nothing on `.github/workflows/` and the composite action.
- The guard covers each rule: release `e2e` job and `deploy: needs: e2e`, no `push` in `e2e.yml`/`self-host.yml`,
  `push` kept in `checks.yml` with gitleaks, the exact `paths-ignore` list without `content/**`, no direct
  `playwright install --with-deps` in any workflow.
- The dry run keeps every earlier property the guard checked (no secrets, `WRANGLER_DRY_RUN`, the wrapper, the CLI pin)
  and migrates an empty database of its own, so it still tests a migration from scratch.
- Residual risk, accepted: a redeploy of an older tag now waits ~5 minutes for the e2e suites first.

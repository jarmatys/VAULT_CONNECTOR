---
change_id: ci-usage-report
title: "Weekly CI minutes report (@softure-ai/ci-usage)"
status: archived
archived_at: 2026-11-18
roadmap_item: null
issue: null
branch: claude/project-thread-vawlp1
created: 2026-11-18
updated: 2026-11-18
---

## Intent

Measure how many GitHub Actions minutes this repository uses, per workflow and job, so that the CI can be optimised
on numbers instead of guesses.

## Scope

- `.github/workflows/ci-usage.yml`: the SOFTURE/AI example caller of the reusable `ci-usage` workflow, every Monday at
  06:30 UTC and on demand, permissions `contents: read`, `actions: read`, `issues: write`, no secret.
- The workflow guard in `scripts/deploy/release-workflows.test.ts` learns a second pin (the ci-usage workflow does not
  exist at the deploy@0.7.3 commit) and checks the schedule, the permissions and that no secret is passed.

Out of scope: the optimisations themselves. They are filed as issues from the first report and wait for the owner's
review.

## Notes

Research skipped: copying a documented example; the only questions (runner, cache warming, the pin) are answered
below. Frame skipped for the same reason.

- Runner: the default `ubuntu-latest`. The repository is public and every job runs on GitHub's standard runner (owner,
  2026-11-18: no Ubicloud here), so `runs-on` and `ubicloud-premium` are not set.
- No daily cache-warming run: the repository has had about 210 runs in total, far below the ~900 a week where
  `GITHUB_TOKEN`'s rate limit starts to matter.
- No `prices`: no self-hosted or larger runners.
- Pin: `2ab9da1328dfd32986db797fcf253bb9f6f0bb10`, the SOFTURE/AI commit that last changed the reusable workflow; it
  installs the released CLI 0.1.1, which accepts the `--max-minutes` flag the workflow passes.

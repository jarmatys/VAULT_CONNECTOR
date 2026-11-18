---
change_id: ci-minutes-optimisation
title: "CI spends its minutes only where they test something new"
status: archived
archived_at: 2026-11-18
roadmap_item: null
issue: "#35, #36, #37, #38, #39, #40"
branch: claude/project-thread-vawlp1
created: 2026-11-18
updated: 2026-11-18
---

## Intent

Cut the GitHub Actions minutes measured by the first CI usage report (#34: 1107 minutes a week) without testing less of
what reaches production. The owner approved the issues #35 to #40 for implementation after a check of each one's sense.

## Scope

- #35: e2e on Node, e2e on Workers, the release dry run and the compose e2e no longer run on push to `master` (the
  same jobs passed on the pull request's head). `checks.yml` keeps the static checks on push. Instead of a nightly
  safety net, `release.yml` calls the e2e workflow on the tag it deploys, before the deploy job: the merged result is
  tested where it matters, and only once per release.
- #36: the release dry run moves into the Workers e2e job (`e2e.yml`), on the same OpenNext build, with an empty second
  database for its migration; `deploy-dry-run.yml` is deleted. Both e2e jobs move to `pgvector:pg17`, as on Neon.
- #37: the gitleaks scan runs first in the static job; the `secrets` job is deleted.
- #38: `e2e.yml` and `self-host.yml` skip pull requests that change only `context/**`, `docs/**` or the Markdown files at
  the root. `content/**` (the app's own docs pages) is not ignored. The e2e jobs move out of `checks.yml` into
  `e2e.yml`, so the skip needs no extra filter job (which would cost its own billed minute on every run).
- #39: a local composite action `.github/actions/playwright` caches Chromium by Playwright's version; used by every job
  that installs it (e2e, self-host, measure).
- #40: not done, closed with the reason (below).

## Notes

Research skipped: the evidence is the report (#34) and the job step timings read for the issues. Frame skipped: the
owner set the goal and the issues are the framing.

- #40, Next.js build cache: the builds run on Turbopack (Next 16.4), which keeps no persistent build cache in
  `.next/cache` without an experimental flag, so caching the folder would save nothing and still upload it each run.
- #40, Docker layer cache: the compose image's expensive layer is `next build`, which every code change invalidates; a
  cached `npm ci` layer saves seconds, against a buildx/gha cache setup that the self-hosted build path does not use.
- Merged results without e2e on `master`: covered by the release gate above and by `static` on every push.

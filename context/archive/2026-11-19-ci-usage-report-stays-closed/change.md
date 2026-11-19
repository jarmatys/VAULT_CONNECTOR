---
change_id: ci-usage-report-stays-closed
title: "The CI usage report issue stays closed"
status: archived
roadmap_item: null
issue: 34
branch: claude/project-thread-cycecw
created: 2026-11-19
updated: 2026-11-19
archived_at: 2026-11-19
---

## Intent

The weekly CI usage report does not sit in the open-issue queue once its optimisations are done: each optimisation
is an issue of its own, and the report issue is updated every week but stays closed, found by its label.

## Context

The owner asked for it on 2026-11-19, after the optimisations of report #34 (#35 to #39, PR #41; #40 not planned)
were finished and #34 was still open. #34 was closed by hand with links to that work. The package side is
`@softure-ai/ci-usage` 0.1.3 (`close-issue`, SOFTURE/AI#1396): without it, the next run would open a new issue.

## Notes

- Research and frame skipped: a one-input caller change; the package research is in SOFTURE/AI's change
  `ci-usage-close-issue`.

## Done

- `.github/workflows/ci-usage.yml` pins the reusable workflow to SOFTURE/AI 54df49a and passes `close-issue: true`;
  the guard in `scripts/deploy/release-workflows.test.ts` holds both.

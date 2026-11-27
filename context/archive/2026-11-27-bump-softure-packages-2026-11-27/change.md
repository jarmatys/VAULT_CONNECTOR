---
change_id: bump-softure-packages-2026-11-27
title: "Every SOFTURE package and pin is on its newest published version"
status: archived
roadmap_item: null
issue: null
branch: claude/bump-softure-2026-11-27
created: 2026-11-27
updated: 2026-11-27
archived_at: 2026-11-27
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE pin is on the newest published version, `@softure-ai/skills`
included, following the package-update routine (`node_modules/@softure-ai/skills/routines/package-updates.md`).

## Context

Nightly run of 2026-11-27. Behind the newest release: theme-notion 0.35.0 (newest 0.41.1) and the SOFTURE/AI deploy
pins `deploy@0.7.9` (newest 0.7.10: the workflow and action pins and the deploy CLI version). Skills 0.41.1 and every
other package are current. Nothing is held (`routines.packageUpdates` is absent).

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on theme-notion 0.41.1.
- Every `uses: SOFTURE/AI/...` deploy pin on the commit of `deploy@0.7.10`, the deploy CLI version 0.7.10 in the
  workflows, `context/workflow.json` and the pin guard `scripts/deploy/release-workflows.test.ts`; docs follow.
- No owner step and no held package.

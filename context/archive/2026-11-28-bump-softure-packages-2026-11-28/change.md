---
change_id: bump-softure-packages-2026-11-28
title: "Every SOFTURE package and pin is on its newest published version"
status: archived
roadmap_item: null
issue: null
branch: claude/bump-softure-2026-11-28
created: 2026-11-28
updated: 2026-11-28
archived_at: 2026-11-28
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE pin is on the newest published version, `@softure-ai/skills`
included, following the package-update routine (`node_modules/@softure-ai/skills/routines/package-updates.md`).

## Context

Nightly run of 2026-11-28. Behind the newest release: mcp-access 0.7.9 (newest 0.7.10) and theme-notion 0.41.1
(newest 0.42.0). Skills 0.41.2, the deploy pins (0.7.10) and every other package are current. Nothing is held
(`routines.packageUpdates` is absent).

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on mcp-access 0.7.10 and theme-notion 0.42.0.
- No owner step and no held package.

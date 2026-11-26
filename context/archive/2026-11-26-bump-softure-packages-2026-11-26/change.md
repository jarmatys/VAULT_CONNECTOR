---
change_id: bump-softure-packages-2026-11-26
title: "Every SOFTURE package and pin is on its newest published version"
status: archived
roadmap_item: null
issue: null
branch: claude/bump-softure-2026-11-26
created: 2026-11-26
updated: 2026-11-26
archived_at: 2026-11-26
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE pin is on the newest published version, `@softure-ai/skills`
included, following the package-update routine (`node_modules/@softure-ai/skills/routines/package-updates.md`).

## Context

Nightly run of 2026-11-26. Behind npm's latest: auth 0.2.23, mcp-access 0.7.8, theme-notion 0.31.0, testing 0.5.2.
Skills 0.41.1, every other package, the SOFTURE/AI pins (`deploy@0.7.9`, ci-usage, backup 0.1.3) and the deploy CLI
0.7.9 are current. Nothing is held (`routines.packageUpdates` is absent).

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on auth 0.2.24, mcp-access 0.7.9, theme-notion 0.35.0, testing 0.6.0.
- `e2e/connector.spec.ts` confirms Disconnect in the token page's new confirmation dialog (mcp-access 0.7.9).
- No owner step and no held package.

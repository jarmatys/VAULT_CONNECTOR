---
change_id: bump-softure-packages-2026-11-23
title: "Every SOFTURE package and pin is on its newest published version"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-7w0e07
created: 2026-11-23
updated: 2026-11-23
archived_at: 2026-11-23
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE pin is on the newest published version, `@softure-ai/skills`
included, following the package-update routine (`node_modules/@softure-ai/skills/routines/package-updates.md`).

## Context

Run on demand by the owner on 2026-11-23. Behind npm's latest: skills 0.24.0, auth 0.2.19, theme-notion 0.29.1. Every
other package and every SOFTURE/AI pin (deploy 0.7.8, backup 0.1.3, ci-usage 0.1.3) was already current. Nothing is
held (`routines.packageUpdates.hold` is absent).

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on skills 0.30.0, auth 0.2.21 and theme-notion 0.30.0.
- The skills installer refreshed `.claude/skills/`, `.claude/softure-skills.json` and the managed block of `AGENTS.md`
  (one item = one change = one thread); `context/state.json` regenerated; the `context-doctor` job pins skills 0.30.0.

---
change_id: bump-softure-packages-2026-11-24-3
title: "Skills 0.37.0: owner answers leave the queue, later moves to the later roadmap"
status: archived
roadmap_item: null
issue: 55
branch: claude/project-thread-8w9cdf
created: 2026-11-24
updated: 2026-11-24
archived_at: 2026-11-24
---

## Intent

`@softure-ai/skills` is on 0.37.0, the newest published version, following the package-update routine
(`node_modules/@softure-ai/skills/routines/package-updates.md`), as the owner-word issue #55 asks.

## Context

On-demand run of 2026-11-24, after PR #54 (skills 0.36.0). Behind npm's latest: skills only (0.36.0, newest 0.37.0).
Every other `@softure-ai/*` dependency and the `deploy@0.7.9` pins are current. Nothing is held
(`routines.packageUpdates.hold` is absent) and no owner steps are recorded in `routines.packageUpdates.ownerSteps`.

## Notes

- Research and frame skipped: a dependency bump; the findings (each version's changes) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on skills 0.37.0.
- The skills installer refreshed `.claude/skills/`, `.claude/softure-skills.json` and the managed block of
  `AGENTS.md`; `context/state.json` regenerated; the `context-doctor` job pins skills 0.37.0.
- No owner entry was answered `later` (no owner-word issue carries an answer line, no entry carries `(later: #N)`), so
  nothing moves to `context/foundation/roadmaps/roadmap-later.md`. The doctor exits 0 with no note.

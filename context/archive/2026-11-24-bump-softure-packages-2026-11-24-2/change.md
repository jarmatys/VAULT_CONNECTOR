---
change_id: bump-softure-packages-2026-11-24-2
title: "Skills 0.36.0 and jobs 0.1.15, with the owner-word wake declared"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-ke1w9h
created: 2026-11-24
updated: 2026-11-24
archived_at: 2026-11-24
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE pin is on the newest published version, following the
package-update routine (`node_modules/@softure-ai/skills/routines/package-updates.md`), run once on demand, and the
project declares how owner-word issues wake it (`autonomy.ownerWordWake`, WORKFLOW.md §8.6).

## Context

On-demand run of 2026-11-24, after the nightly run of the same day (PR #53). Behind npm's latest: skills 0.34.0
(newest 0.36.0) and jobs 0.1.14 (newest 0.1.15). Every other package and the `deploy@0.7.9` pins were current. Nothing
is held (`routines.packageUpdates.hold` is absent). The owner-word wake routine could not be created from the
coordinator's session (no GitHub-triggered scheduled task there), so the declaration is `"none"` until it exists.

## Notes

- Research and frame skipped: a dependency bump; the findings (each version's "Migrate" lines) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on skills 0.36.0 and jobs 0.1.15.
- The skills installer refreshed `.claude/skills/`, `.claude/softure-skills.json` and the managed block of
  `AGENTS.md`; `context/state.json` regenerated; the `context-doctor` job pins skills 0.36.0.
- `context/workflow.json` declares `autonomy.ownerWordWake: "none"`; the `owner-word` label already exists on the
  repository. The doctor exits 0 with no owner-word-wake note.

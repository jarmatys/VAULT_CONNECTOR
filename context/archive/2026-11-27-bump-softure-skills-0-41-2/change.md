---
change_id: bump-softure-skills-0-41-2
title: "Skills 0.41.2: a queued roadmap is no longer an owner-queue entry"
status: archived
roadmap_item: null
issue: 62
branch: claude/friendly-noether-4n2zn6
created: 2026-11-27
updated: 2026-11-27
archived_at: 2026-11-27
---

## Intent

`@softure-ai/skills` is on 0.41.2, the newest published version, and `context/state.json` is regenerated with it, as
the cockpit issue #62 asks.

## Context

Since 0.41.2 a queued roadmap is listed only under `queued` in `context/state.json` and is no longer an `owner_queue`
entry. The project was on 0.41.1.

## Notes

- Research and frame skipped: a patch bump of one package; the findings are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on skills 0.41.2; the installer refreshed `.claude/skills/` and
  `.claude/softure-skills.json`; the managed block of `AGENTS.md` is unchanged.
- The `context-doctor` job pins skills 0.41.2.
- `context/state.json` regenerated with 0.41.2: no change. The project has no queued roadmap, so `owner_queue` keeps
  its 15 entries, all from the pre-release steps of the closed 2026-11-18 roadmap.

---
change_id: bump-softure-skills-0-33-0
title: "The project is on @softure-ai/skills 0.33.0"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-ih35tb
created: 2026-11-23
updated: 2026-11-23
archived_at: 2026-11-23
---

## Intent

`@softure-ai/skills` is on 0.33.0, so the owner's reports dashboard reads this project's roadmap and state the same way
as the other projects.

## Context

Ordered by the owner on 2026-11-23: install 0.33.0, run the installer, run the doctor (fixing `roadmap-item-shape` if
reported), regenerate the state, keep the doctor green. The project has no live roadmap; the last one is archived in
`context/foundation/archive/2026-11-18-roadmap.md`.

## Notes

- Research and frame skipped: a dependency bump; the findings are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on skills 0.33.0; the installer refreshed `.claude/skills/`,
  `.claude/softure-skills.json` and the managed block of `AGENTS.md`; the `context-doctor` job pins skills 0.33.0.
- `npx softure-skills doctor` exits 0 with no roadmap fixes needed; `context/state.json` regenerated unchanged.

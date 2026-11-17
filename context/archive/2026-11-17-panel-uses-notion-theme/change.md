---
change_id: panel-uses-notion-theme
title: "The app is drawn in the kit's Notion style"
status: archived
roadmap_item: null
branch: claude/project-thread-u4beke
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
The whole app (the panel first, the landing and the package pages with it) is drawn with `@softure-ai/theme-notion`,
the Notion style of the SOFTURE kit, wired the way the owner's other apps on the kit wire it, and `DESIGN.md` tells every
later item (VC-7 onwards) to build in that style.

## Context
Owner, 2026-11-17: the panel is to be in the Notion style of the kit in SOFTURE/AI, not Flat Paint. VC-1 had wired
`@softure-ai/theme-flat-paint` with an amber accent. The owner pointed at the trip planner as the proven pattern.

## Constraints
- No token or component patched locally; a gap is fixed in SOFTURE/AI.
- Stay at the level of the theme and the layout: VC-7 builds the folder picker in parallel.
- Every existing e2e test keeps passing; the theme's look is held by a test.

## Notes
- Outside the roadmap (`roadmap_item: null`), so no roadmap row changes.
- Research kept short (`research.md`): the pattern is copied from the trip planner and the theme README.

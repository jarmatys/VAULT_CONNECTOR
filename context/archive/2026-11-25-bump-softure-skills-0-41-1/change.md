---
change_id: bump-softure-skills-0-41-1
title: "Skills 0.41.1: cockpit issues and the COCKPIT command replace owner-word issues"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-k6v8nd
created: 2026-11-25
updated: 2026-11-25
archived_at: 2026-11-25
---

## Intent

`@softure-ai/skills` is on 0.41.1, the newest published version, so the project can take the COCKPIT command
(`node_modules/@softure-ai/skills/routines/cockpit-command.md`), as the owner asked on 2026-11-25.

## Context

The project was on 0.37.0. Between 0.37.0 and 0.41.1 the owner's written word moved from `owner-word` issues and the
owner-word wake routine to `cockpit` issues and the COCKPIT command (a scheduled task COCKPIT fires through an API
trigger; nothing about it is written to the repository). The managed block also gained the main branch's CI watch
(`wt-main-ci.py`) and the rule that a test failing once is a bug.

## Notes

- Research and frame skipped: a dependency bump; the findings are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on skills 0.41.1; the installer refreshed `.claude/skills/`,
  `.claude/softure-skills.json` (label `cockpit`) and the managed block of `AGENTS.md`.
- `context/state.json` regenerated; the `context-doctor` job pins skills 0.41.1.
- `autonomy.ownerWordWake` removed from `context/workflow.json`: the package no longer reads it, and the COCKPIT
  command is declared nowhere in the repository.

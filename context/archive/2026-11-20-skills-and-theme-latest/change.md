---
change_id: skills-and-theme-latest
title: "The workflow skills and the theme packages are on their latest versions"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-w8utiz
created: 2026-11-20
updated: 2026-11-20
archived_at: 2026-11-20
---

## Intent

Every `@softure-ai/*` dependency is on the newest published version, `@softure-ai/skills` included, and the skills'
installer refreshes `.claude/` and the managed block of `AGENTS.md`.

## Context

Asked by the owner on 2026-11-20, after `softure-packages-latest` (PR #44) moved the runtime packages the same
morning. Behind npm's latest: theme-notion 0.28.0, ui 0.3.10 and skills 0.19.0. Every other package and every
SOFTURE/AI pin (deploy 0.7.8, backup 0.1.3) was already current.

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in research.md.

## Done

- `package.json` and the lockfile on theme-notion 0.29.1, ui 0.3.11 and skills 0.22.0.
- The skills installer refreshed `.claude/skills/` (adds `softure-doctor`), `.claude/softure-skills.json` and the
  managed block of `AGENTS.md` (doctor and `context/state.json`, owner-word issues); the project's own rules above the
  block are unchanged.

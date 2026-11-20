---
change_id: context-doctor-to-zero
title: "The context/ doctor passes and runs on every pull request"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-w8utiz
created: 2026-11-20
updated: 2026-11-20
archived_at: 2026-11-20
---

## Intent

`npx softure-skills doctor` exits 0 on `context/` without a baseline, `context/state.json` is written, and the doctor
runs in the `checks` workflow on every pull request, documentation-only ones included.

## Context

Asked by the owner on 2026-11-20, after skills 0.22.0 brought the doctor (`skills-and-theme-latest`). Nothing was in
flight: no open change, no active roadmap, no open pull request besides the skills bump.

## Notes

- Research and frame skipped: the doctor's sweep is the research; its result is in research.md.

## Done

- Before: 1 failure (`archived-roadmap-open-checks`, two entries) and the `state-missing` note; `--fix` found 0 edits.
- The two entries are the owner's (a pricing decision, a directory submission with the owner's account): carried to
  the owner-word issues #46 and #47 and ticked with that.
- `context/state.json` written; the doctor exits 0.
- `checks.yml` runs `npx softure-skills doctor` after `npm ci`; the workflow has no path filter, so it runs for
  `context/`-only pull requests too.

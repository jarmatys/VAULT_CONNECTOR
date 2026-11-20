---
change_id: skills-0-24-context-doctor-job
title: "The workflow skills are on 0.24 and the context/ doctor runs in its own job"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-856jrb
created: 2026-11-20
updated: 2026-11-20
archived_at: 2026-11-20
---

## Intent

`@softure-ai/skills` is on its latest version (0.24.0), its installer's output is committed, `context/state.json` is
regenerated for the new schema, and the doctor runs in a CI job named `context-doctor` on every pull request.

## Context

Asked by the owner on 2026-11-20. Skills 0.22.0 came in with PR #45; PR #48 ran the doctor as a step of the `static`
job in `checks.yml`. Skills 0.24.0 fills `project` in `context/state.json` (schema 2, ids on owner-queue entries) and
asks for the doctor in a job of its own named `context-doctor`, so readers can find its check run by name.

## Notes

- Research and frame skipped: a dependency bump; the installer's instructions are the findings (research.md).

## Done

- `package.json` and the lockfile on skills 0.24.0; the installer refreshed `.claude/skills/`,
  `.claude/softure-skills.json` and the managed block of `AGENTS.md`; the project's own rules are unchanged.
- `context/workflow.json` names the project (`"project": "VaultConnector"`); `context/state.json` regenerated.
- `.github/workflows/checks.yml`: the doctor moved out of `static` into its own job `context-doctor` (no paths filter,
  no condition), guarded by `scripts/deploy/release-workflows.test.ts`.

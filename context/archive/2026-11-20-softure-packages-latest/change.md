---
change_id: softure-packages-latest
title: "The SOFTURE packages are on their latest versions"
status: archived
roadmap_item: null
issue: null
branch: claude/project-thread-3p50os
created: 2026-11-20
updated: 2026-11-20
archived_at: 2026-11-20
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE/AI pin in the workflows is on the newest published version, and
the app takes up what those versions ask an adopting app to do.

## Context

Asked by the owner on 2026-11-20 after a run of package releases. Behind npm's latest: auth 0.2.19, backup 0.1.3,
files 0.6.1, jobs 0.1.14, mcp-access 0.7.8, observability 0.8.8, security 0.2.12, config 0.1.7, and the transitive
deploy 0.7.8 (workflow pins and the integration commands were on deploy@0.7.3). ci-usage, skills and the rest were
already current.

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in research.md.

## Done

- `package.json` and the lockfile on the versions above; the nested `@softure-ai/deploy` on 0.7.8.
- SOFTURE/AI pins moved to the `deploy@0.7.8` commit (45535f0) in release, auto-release, backup and e2e workflows,
  `deploy-cli-version` 0.7.8, `context/workflow.json` integration commands 0.7.8; the guard in
  `scripts/deploy/release-workflows.test.ts` holds them.
- `backup-verify.yml` takes deploy 0.7.7's failure reporting (an issue labelled `backup-verify`, closed on the next
  green run) and runs `softure-backup verify` 0.1.3.
- The OAuth consent page answers `X-Frame-Options: DENY` and `frame-ancestors 'none'` through mcp-access 0.7.8's
  `buildOAuthConsentHeaders` in `next.config.ts` (unit test `next.config.test.ts`, e2e check in `e2e/assistant.ts`).

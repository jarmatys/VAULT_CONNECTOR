---
change_id: bump-softure-packages-2026-11-24
title: "Every SOFTURE package and pin is on its newest published version"
status: archived
roadmap_item: null
issue: null
branch: claude/bump-softure-2026-11-24
created: 2026-11-24
updated: 2026-11-24
archived_at: 2026-11-24
---

## Intent

Every `@softure-ai/*` dependency and every SOFTURE pin is on the newest published version, `@softure-ai/skills`
included, following the package-update routine (`node_modules/@softure-ai/skills/routines/package-updates.md`).

## Context

Nightly run of 2026-11-24. Behind npm's latest: alerts 0.2.3, auth 0.2.21, billing 0.11.3, mailing 0.2.8, privacy 0.2.5,
theme-notion 0.30.0, waitlist 0.5.4, skills 0.33.0, and the SOFTURE/AI pins and the transitive CLI on deploy 0.7.8.
ci-usage 0.1.3, backup 0.1.3 and every other package were current. Nothing is held (`routines.packageUpdates.hold`
is absent).

## Notes

- Research and frame skipped: a dependency bump; the findings (each CHANGELOG's "Migrate" lines) are in plan.md.
- No release, no deploy: this rides the next release the owner orders.

## Done

- `package.json` and the lockfile on alerts 0.2.4, auth 0.2.23, billing 0.11.4, mailing 0.3.0, privacy 0.3.0,
  theme-notion 0.31.0, waitlist 0.5.5, skills 0.34.0; the transitive deploy on 0.7.9.
- mailing 0.3.0 and privacy 0.3.0 key every address with the new `SOFTURE_EMAIL_KEY_SECRET`: it is a required secret
  of the Worker (`wrangler.jsonc`, the release's `env:` and `secret-names`, the dry run's stand-in), a required value
  of the self-hosted compose file, and documented in `.env.example`, `docs/deployment.md`, `docs/self-hosting.md` and
  `CONTRIBUTING.md`. The e2e servers get a test value, and the e2e specs derive consent keys with it.
- The account erase and export suites stub the secret; the operator's reviewer removal step names it.
- SOFTURE/AI pins and the deploy CLI moved to `deploy@0.7.9` (a8f8af4); `deploy.json` lists `publicPaths: ["/"]`.
- The skills installer refreshed `.claude/skills/`, `.claude/softure-skills.json` and the managed block of
  `AGENTS.md`; the `context-doctor` job pins skills 0.34.0.

## Before the next release

- Owner step: set the `production` secret `SOFTURE_EMAIL_KEY_SECRET` (`openssl rand -base64 32`, at least 32
  characters, never changed afterwards); the release refuses to render the Worker's secrets without it. Reason:
  mailing 0.3.0 and privacy 0.3.0 key every stored address with it.

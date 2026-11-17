---
change_id: dependencies-to-latest
title: "Dependencies and SOFTURE pins moved to their latest compatible versions"
status: archived
archived_at: 2026-11-17
roadmap_item: null
branch: claude/project-thread-c6i8iy
created: 2026-11-17
updated: 2026-11-17
---

## Intent

Every npm dependency, the `@softure-ai/*` packages first, and the SOFTURE/AI workflow pins move to their latest
versions during the hosted-product roadmap, in one small change that touches only manifests, the lockfile and pins.

## Scope

- `@softure-ai/db` 0.1.17, `@softure-ai/security` 0.2.10, `@softure-ai/theme-notion` 0.23.0, `wrangler` 4.164.0,
  `globals` 17; transitive updates within the existing ranges (`npm update`).
- SOFTURE/AI action and workflow pins and `deploy-cli-version` from `deploy@0.7.1` to `deploy@0.7.3`
  (`7bca0c41`), with the guard in `scripts/deploy/release-workflows.test.ts`, `docs/deployment.md` and the
  integration commands in `context/workflow.json`.

## Notes

- Research and frame skipped: a version bump measured with `npm outdated` and the peer ranges on npm.

## Decisions (auto)

- `typescript` stays on 6.0: `typescript-eslint` 8.73 (latest) accepts `>=4.8.4 <6.1.0`, so TypeScript 7 breaks lint.
- `eslint` and `@eslint/js` stay on 9: `eslint-config-next` 16.4.6 pulls `eslint-plugin-react`, `-import` and
  `-jsx-a11y`, whose latest releases accept ESLint up to 9 only.
- `@types/node` stays on 22: it follows the runtime floor (`engines.node >=22.18`, Node 22 in CI); newer types would
  let code use APIs that Node 22 lacks.
- Between `deploy@0.7.1` and `deploy@0.7.3` the SOFTURE/AI actions this app calls are unchanged; the pins move so the
  CLI version and the pinned commit stay one release.

# Plan: Docs and the reviewer account (VC-17)

## Approach
Markdown pages in `content/docs/` rendered at build time into prerendered `/docs` and `/docs/[slug]` pages in the
Notion theme (PageHeader, List nav, Prose body); agent-ready mounted with its route files around a database-free
discovery factory; an operator command `npm run reviewer` that creates an account connected to an S3 bucket holding the
fictional vault `content/reviewer-vault/`, shares every top folder, queues a sync and sets the trial end; the directory
checklist as a docs page whose evidence paths a test holds to existing files.

## Decisions (auto)
- Fixture vault through the S3 source, not a new source kind: no migration, the reviewer sees the real sync. The bucket
  is the owner's step; the command reads `REVIEWER_VAULT_*`.
- Time-limited sign-in = a temporary password plus the trial ending after `--days` (default 14, at most 60);
  `--remove` erases the account. A failed run erases the half-made account.
- Script under `scripts/reviewer-account.ts` beside the other operator scripts (the roadmap's `scripts/ops/` path
  does not exist in this repository).
- `Prose` goes to `@softure-ai/theme-notion` (SOFTURE/AI), not into the app: the owner's design-kit order.
- Agent-ready name `io.github.jarmatys/vaultconnector` until the product's domain exists.

## Phases
1. Kit: `Prose` in theme-notion with tests, gallery case and baselines; release 0.25.0 (SOFTURE/AI).
2. Docs pages: content, parse/render, `/docs` routes, footer link, sitemap, unit tests.
3. Agent discovery: agent-ready config entry, route files, discovery factory, Link header and ai-catalog link, tests.
4. Reviewer account: fixture vault, module, command, tests on PGlite with the fake S3.
5. Directory checklist page with evidence guard; e2e for docs and discovery; deployment owner step; close.

## Progress
- [x] Phase 1: kit `Prose` (SOFTURE/AI branch, theme-notion 0.25.0)
- [x] Phase 2: docs pages
- [x] Phase 3: agent discovery
- [x] Phase 4: reviewer account
- [x] Phase 5: checklist, e2e, owner step

---
change_id: picked-folders-stay-in-sync
title: "Picked folders stay in sync"
status: archived
roadmap_item: VC-8
branch: claude/project-thread-cp15lz
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
Copies of the Markdown notes in the picked folders are kept in object storage under a prefix derived from a keyed hash of the account id; a push to the source (webhook) or the scheduled check syncs only what changed, in small resumable jobs inside the background budget; oversized and non-Markdown files are skipped and counted; unpicked folders' copies are removed; the table of contents (path, title, tags, aliases, description, last change) is rebuilt with each sync.

## Context
Roadmap item VC-8 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-8: Picked folders stay in sync
> - **Change ID:** `picked-folders-stay-in-sync`
> - **Status:** ready
> - **Outcome:** copies of the Markdown notes in the picked folders are kept in object storage under a prefix derived
>   from a keyed hash of the account id; a push to the source (webhook) or the scheduled check syncs only what changed,
>   in small resumable jobs inside the background budget; oversized and non-Markdown files are skipped and counted;
>   unpicked folders' copies are removed; the table of contents (path, title, tags, aliases, description, last change)
>   is rebuilt with each sync.
> - **Prerequisites:** VC-7; R2 bucket and the hashing secret as placeholders (owner).
> - **Touches (estimate):** `src/vault/sync/**`, `src/vault/storage/**`, `src/vault/toc/**`, `src/jobs/handlers.ts`,
>   `src/app/api/webhooks/github/**`, one app migration (`vault.notes`, `vault.sync_runs`), `softure.config.ts` (files,
>   jobs entries).
> - **Unknowns:**
>   - Job size that fits the 45 s tick on a 5,000-note fixture vault; Cloudflare Queues only if measurement says the job
>     table cannot keep up. (owner: research; blocks: no)
>   - Keep the table of contents in Postgres or as one object per account. (owner: research; blocks: no)
> - **Risk:** the main technical risk (background budget); measured here before the index builds on it.
> - **Baseline:** no copies; after: a test syncs a 5,000-note fixture in budgeted jobs, a pushed change appears within
>   10 minutes of fake time, storage keys contain no account id.
> - **PRD refs:** FR-7, NFR-4, NFR-5, G-2

Findings gathered while recording the roadmap:

- The owner's private single-user prototype (outside this repository) offers four read-only tools: `search_vault` (query, optional top folder, mode hybrid|keyword|vector, max_results 1-20, default 8; passages with path and score), `vault_index` (folder, filter, depth, recursive, sort name|recent, max_results; table of contents built at sync time: path, title from frontmatter `title` then first `#` heading then file name, tags, aliases, description from `description`/`summary`, last commit date; folder descriptions from a folder note; case- and accent-insensitive matching), `get_note` (path, Unicode NFC, cut at 60,000 characters) and `vault_status` (note count, searches used of the monthly cap, table of contents date). Every note text is wrapped in untrusted-data markers; server instructions say when to use the tools and in which order (table of contents and read note first, search for content). It syncs incrementally from the last synced commit, skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md`, and caps searches per month. Model the contracts on it; do not copy its code.
- SOFTURE/AI `docs/07-runtime-providers.md`: `platform: { host: "cloudflare" }` in `softure.config.ts`; `withRequestDatabase` on the Hyperdrive URL; jobs run from a Cron Trigger through `createScheduledHandler` (`@softure-ai/jobs/workers`, one `runJobsTick` per minute, 45 s budget); `softure-deploy init --host=cloudflare` writes `wrangler.jsonc`, `open-next.config.ts`, `worker.ts`, deploy, backup and backup-verify workflows; D1 is not supported (Postgres on every host).
- `@softure-ai/files` 0.5.x: `createS3Storage({ endpoint, region: "auto", bucket })` for R2; per-owner quota and content hashes. Planning context: every account's data under a prefix derived from a keyed hash of the account id.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/vault/sync/**`, `src/vault/storage/**`, `src/vault/toc/**`, `src/jobs/handlers.ts`, `src/app/api/webhooks/github/**`, one app migration (`vault.notes`, `vault.sync_runs`), `softure.config.ts` (files, jobs entries).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Done
- VC-8: copies of the notes in the picked folders live in the note store (R2 through `@softure-ai/files`' S3 driver,
  or a local directory when self-hosted) under `v1/<HMAC of the account id>/<sha256 of the path>`; the table of
  contents (path, title, tags, aliases, description, last change) lives in `vault.notes`.
- A sync step lists the source, copies what changed and removes what is no longer shared, at most 50 files and 20 s per
  step, resumable (`vault.sync_runs`, `vault.sync_items`, a lease per account). Oversized notes and non-notes are
  skipped and counted.
- Triggers: the GitHub App's push webhook (`/api/webhooks/github`), a saved pick, and a check every five minutes; on
  Workers the jobs run from a Cron Trigger every minute, on Node from `npm run worker`.
- Owner step: an R2 bucket with the EU jurisdiction for the notes, an R2 token with Object Read and Write on it only, and
  the secrets `VAULT_S3_ENDPOINT`, `VAULT_S3_BUCKET`, `VAULT_S3_ACCESS_KEY_ID`, `VAULT_S3_SECRET_ACCESS_KEY`,
  `VAULT_STORAGE_KEY_SECRET` in the `production` environment (`docs/deployment.md`, Owner steps 6).
- Owner step: the GitHub App's webhook on (URL `https://<APP_DOMAIN>/api/webhooks/github`, event "Push") and its secret
  as `GH_WEBHOOK_SECRET`.

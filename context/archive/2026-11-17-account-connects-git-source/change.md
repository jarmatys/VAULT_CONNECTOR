---
change_id: account-connects-git-source
title: "An account connects a git source"
status: archived
roadmap_item: VC-6
branch: claude/project-thread-2flrdk
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
An account installs the product's GitHub App on exactly one repository with read-only contents access; the panel names the repository, and a revoked installation shows as disconnected. The vault source interface (list tree, read file, changes since a cursor) exists with git as its first adapter.

## Context
Roadmap item VC-6 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-6: An account connects a git source
> - **Change ID:** `account-connects-git-source`
> - **Status:** ready
> - **Outcome:** an account installs the product's GitHub App on exactly one repository with read-only contents access;
>   the panel names the repository, and a revoked installation shows as disconnected. The vault source interface (list
>   tree, read file, changes since a cursor) exists with git as its first adapter.
> - **Prerequisites:** VC-5; a GitHub App registered by the owner (placeholder ids in configuration until then).
> - **Touches (estimate):** `src/vault/sources/**`, `src/vault/sources/github/**`, `src/app/(panel)/source/**`,
>   one app migration (`vault.sources`), SOFTURE/AI `@softure-ai/connections` (per-account GitHub App installations).
> - **Unknowns:**
>   - `@softure-ai/connections` connects the app's own accounts (admin only). Per-account GitHub App installations with
>     installation tokens are a generic gap: fix it in SOFTURE/AI (owner, 2026-11-16). (owner: research; blocks: no)
>   - Read the repository through the REST API (tree plus blobs or a tarball) on Workers: which fits the 128 MB isolate
>     and the request budget. (owner: research; blocks: no)
> - **Risk:** the first item of the vault pipeline; the source interface it defines is reused by VC-20..VC-22.
> - **Baseline:** no source; after: e2e connects a fake GitHub App installation and the panel names the repository;
>   revocation shows as disconnected.
> - **PRD refs:** FR-6, G-2

Findings gathered while recording the roadmap:

- `@softure-ai/connections` 0.4.x: providers from configuration, admin-only `ConnectionsPage`, `getAccessToken`/`requestWithConnection` for the app's own accounts (`default` or named). It has no per-end-user connection or GitHub App installation token flow: a generic gap, fixed directly in SOFTURE/AI (owner, 2026-11-16).
- The owner's private single-user prototype (outside this repository) offers four read-only tools: `search_vault` (query, optional top folder, mode hybrid|keyword|vector, max_results 1-20, default 8; passages with path and score), `vault_index` (folder, filter, depth, recursive, sort name|recent, max_results; table of contents built at sync time: path, title from frontmatter `title` then first `#` heading then file name, tags, aliases, description from `description`/`summary`, last commit date; folder descriptions from a folder note; case- and accent-insensitive matching), `get_note` (path, Unicode NFC, cut at 60,000 characters) and `vault_status` (note count, searches used of the monthly cap, table of contents date). Every note text is wrapped in untrusted-data markers; server instructions say when to use the tools and in which order (table of contents and read note first, search for content). It syncs incrementally from the last synced commit, skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md`, and caps searches per month. Model the contracts on it; do not copy its code.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/vault/sources/**`, `src/vault/sources/github/**`, `src/app/(panel)/source/**`, one app migration (`vault.sources`), SOFTURE/AI `@softure-ai/connections` (per-account GitHub App installations).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Notes
- Panel route: `/panel/source` (`src/app/(panel)/panel/source/**`, per VC-5's note on the guard prefix).
- The vault schema is the app's own SOFTURE module `vault` (`src/vault/module.ts`, SQL in `src/vault/migrations/`), so
  `softure migrate`, the test databases and the module order (after auth) need no second migration mechanism.
- The generic GitHub App calls went to SOFTURE/AI as `@softure-ai/connections/github-app` 0.5.0 (change
  `connections-github-app-installations` there); this repository keeps only what is vault-specific.

## Done
- VC-6: an account installs the product's GitHub App on exactly one repository (contents read-only) from
  `/panel/source`; the installation is proven to be the person's through the App's user authorization (PKCE), the panel
  names the repository, and an uninstalled or suspended App shows as disconnected. The provider-neutral `VaultSource`
  interface (`getCursor`, `listTree`, `readFile`, `listChangesSince`) has git as its first adapter, for VC-7 and
  VC-20..22. SOFTURE/AI gained `@softure-ai/connections/github-app` 0.5.0. E2E on Node and workerd.

## Before the next release
- Owner step: on the GitHub App registered for VC-5, add the repository permissions "Contents: read-only" and
  "Metadata: read-only" (nothing else), set the Setup URL to `<APP_ORIGIN>/panel/source/github/setup`, add the
  callback URL `<APP_ORIGIN>/panel/source/github/callback` next to the sign-in one, generate a private key, and store
  `GH_APP_ID`, `GH_APP_SLUG` and `GH_APP_PRIVATE_KEY` in the production environment.

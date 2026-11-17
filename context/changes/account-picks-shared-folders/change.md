---
change_id: account-picks-shared-folders
title: "An account picks shared folders"
status: plan_reviewed
roadmap_item: VC-7
branch: claude/project-thread-86v5mm
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Intent
The panel shows the connected vault's folder tree with note counts and nothing ticked; the account ticks folders and saves; unticking a folder removes it from what is shared.

## Context
Roadmap item VC-7 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-7: An account picks shared folders
> - **Change ID:** `account-picks-shared-folders`
> - **Status:** ready
> - **Outcome:** the panel shows the connected vault's folder tree with note counts and nothing ticked; the account ticks
>   folders and saves; unticking a folder removes it from what is shared.
> - **Prerequisites:** VC-6
> - **Touches (estimate):** `src/vault/folders/**`, `src/app/(panel)/folders/**`, one app migration
>   (`vault.shared_folders`), `messages/en.ts` (folders).
> - **Unknowns:**
>   - Default ignore rules (`.obsidian/`, `.trash/`, `.git*`, Excalidraw) shown or hidden in the tree. (owner: research;
>     blocks: no)
> - **Risk:** this is the trust mechanism of the product; the rule "nothing shared before a pick" starts here.
> - **Baseline:** no picks; after: e2e ticks two folders of the fixture vault and the saved set equals them.
> - **PRD refs:** FR-8, G-2

Findings gathered while recording the roadmap:

- The owner's private single-user prototype (outside this repository) offers four read-only tools: `search_vault` (query, optional top folder, mode hybrid|keyword|vector, max_results 1-20, default 8; passages with path and score), `vault_index` (folder, filter, depth, recursive, sort name|recent, max_results; table of contents built at sync time: path, title from frontmatter `title` then first `#` heading then file name, tags, aliases, description from `description`/`summary`, last commit date; folder descriptions from a folder note; case- and accent-insensitive matching), `get_note` (path, Unicode NFC, cut at 60,000 characters) and `vault_status` (note count, searches used of the monthly cap, table of contents date). Every note text is wrapped in untrusted-data markers; server instructions say when to use the tools and in which order (table of contents and read note first, search for content). It syncs incrementally from the last synced commit, skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md`, and caps searches per month. Model the contracts on it; do not copy its code.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/vault/folders/**`, `src/app/(panel)/folders/**`, one app migration (`vault.shared_folders`), `messages/en.ts` (folders).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Notes
- Started 2026-11-17 after the owner's word "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat.
- The end-to-end test needs the fake GitHub App to serve repository contents: added to `@softure-ai/connections`
  0.6.0 in SOFTURE/AI (generic gap, fixed there directly).

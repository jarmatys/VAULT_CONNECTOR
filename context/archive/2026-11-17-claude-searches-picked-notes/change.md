---
change_id: claude-searches-picked-notes
title: "Claude searches picked notes"
status: archived
roadmap_item: VC-11
branch: claude/project-thread-ec4fc6
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
`search_vault` returns ranked passages (hybrid by default, keyword or meaning on request) with path and score, narrowed by folder on request, counted against a monthly search allowance shown by `vault_status`; the server instructions place it after the table of contents.

## Context
Roadmap item VC-11 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-11: Claude searches picked notes
> - **Change ID:** `claude-searches-picked-notes`
> - **Status:** ready
> - **Outcome:** `search_vault` returns ranked passages (hybrid by default, keyword or meaning on request) with path and
>   score, narrowed by folder on request, counted against a monthly search allowance shown by `vault_status`; the server
>   instructions place it after the table of contents.
> - **Prerequisites:** VC-9, VC-10
> - **Touches (estimate):** `src/mcp/tools/search.ts`, `src/mcp/instructions.ts`, `src/vault/index/query.ts`.
> - **Unknowns:**
>   - Rank fusion weights and passage size for the fewest tokens at the same hit rate. (owner: research; blocks: no)
> - **Risk:** joins the two risk items; the p95 target of NFR-1 is measured here.
> - **Baseline:** no search tool; after: MCP client test finds the fixture answers; p95 < 3 s on the 5,000-note fixture.
> - **PRD refs:** FR-12, FR-16, NFR-1, NFR-2, G-2

Findings gathered while recording the roadmap:

- The owner's private single-user prototype (outside this repository) offers four read-only tools: `search_vault` (query, optional top folder, mode hybrid|keyword|vector, max_results 1-20, default 8; passages with path and score), `vault_index` (folder, filter, depth, recursive, sort name|recent, max_results; table of contents built at sync time: path, title from frontmatter `title` then first `#` heading then file name, tags, aliases, description from `description`/`summary`, last commit date; folder descriptions from a folder note; case- and accent-insensitive matching), `get_note` (path, Unicode NFC, cut at 60,000 characters) and `vault_status` (note count, searches used of the monthly cap, table of contents date). Every note text is wrapped in untrusted-data markers; server instructions say when to use the tools and in which order (table of contents and read note first, search for content). It syncs incrementally from the last synced commit, skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md`, and caps searches per month. Model the contracts on it; do not copy its code.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/mcp/tools/search.ts`, `src/mcp/instructions.ts`, `src/vault/index/query.ts`.
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Done
`search_vault`: ranked passages (hybrid by default, keyword or meaning on request) with path and score between the
untrusted markers, narrowed by a shared folder in SQL, 1-20 results (default 8), "no results" with the query echoed;
each search counts against a per-account monthly allowance in `@softure-ai/metering` (`SEARCHES_PER_MONTH`, 1,000 by
default), refused with the reset date while the other tools keep working; `vault_status` shows the month's use; the
instructions place search after the table of contents. p95 76 ms on 5,000 notes.

Owner step: optional `SEARCHES_PER_MONTH` in the production Worker's variables when the default of 1,000 should differ
(until VC-14 sets limits per plan).

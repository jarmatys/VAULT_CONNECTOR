---
change_id: claude-reads-picked-notes
title: "Claude reads picked notes"
status: archived
roadmap_item: VC-9
branch: claude/project-thread-jy6xr0
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
The MCP endpoint accepts OAuth 2.1 with dynamic client registration and a consent page naming the account and "read-only"; it offers `vault_index`, `get_note` and `vault_status`, each read-only with a title, every note text between untrusted-data markers, and server instructions saying when and in which order to use them; tokens are listed and revoked in the panel; an isolation test proves no answer contains another account's or an unpicked folder's content.

## Context
Roadmap item VC-9 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-9: Claude reads picked notes
> - **Change ID:** `claude-reads-picked-notes`
> - **Status:** ready
> - **Outcome:** the MCP endpoint accepts OAuth 2.1 with dynamic client registration and a consent page naming the account
>   and "read-only"; it offers `vault_index`, `get_note` and `vault_status`, each read-only with a title, every note
>   text between untrusted-data markers, and server instructions saying when and in which order to use them; tokens are
>   listed and revoked in the panel; an isolation test proves no answer contains another account's or an unpicked
>   folder's content.
> - **Prerequisites:** VC-8
> - **Touches (estimate):** `src/mcp/**`, `src/app/api/mcp/**`, `src/app/api/oauth/**`, `src/app/oauth/**`,
>   `src/app/(panel)/connectors/**`, `softure.config.ts` (mcp-access entry).
> - **Unknowns:**
>   - Claude's current redirect hosts and protocol versions for remote connectors. (owner: research; blocks: no)
> - **Risk:** first proof of the promise; it goes as early as the pipeline allows.
> - **Baseline:** no server; after: an MCP client test registers, consents, lists tools with annotations, reads a note
>   and the table of contents; the isolation test runs on two fixture accounts.
> - **PRD refs:** FR-11, FR-13, FR-14, FR-15, FR-16, FR-17, NFR-2, G-2, G-3

Findings gathered while recording the roadmap:

- The owner's private single-user prototype (outside this repository) offers four read-only tools: `search_vault` (query, optional top folder, mode hybrid|keyword|vector, max_results 1-20, default 8; passages with path and score), `vault_index` (folder, filter, depth, recursive, sort name|recent, max_results; table of contents built at sync time: path, title from frontmatter `title` then first `#` heading then file name, tags, aliases, description from `description`/`summary`, last commit date; folder descriptions from a folder note; case- and accent-insensitive matching), `get_note` (path, Unicode NFC, cut at 60,000 characters) and `vault_status` (note count, searches used of the monthly cap, table of contents date). Every note text is wrapped in untrusted-data markers; server instructions say when to use the tools and in which order (table of contents and read note first, search for content). It syncs incrementally from the last synced commit, skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md`, and caps searches per month. Model the contracts on it; do not copy its code.
- `@softure-ai/mcp-access` 0.7.x: hashed scoped tokens, `createMcpEndpoint({ createServer })`, OAuth 2.1 (`oauth.enabled`) with dynamic registration (`oauth.registration: open|closed`), consent UI parts, token manager.
- Claude directory: remote HTTPS, OAuth 2.0, `title` and `readOnlyHint` on every tool.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/mcp/**`, `src/app/api/mcp/**`, `src/app/api/oauth/**`, `src/app/oauth/**`, `src/app/(panel)/connectors/**`, `softure.config.ts` (mcp-access entry).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Done
- VC-9: Claude (or any MCP client) connects to `/api/mcp` through OAuth 2.1 with dynamic client registration and a
  consent page that names the account and "Read only: the notes in the folders you shared"; hand-issued tokens work
  too. Every token reads only (`allowWrites: false`, no write tool).
- Tools `vault_index` (table of contents with folder, filter, depth, recursive, sort, max_results), `get_note` (whole
  note, cut at 60,000 characters) and `vault_status`, each with a title and `readOnlyHint`; everything taken from notes
  sits between the untrusted-data markers. The server's instructions say when and in which order to use them and carry
  the account's own sentence about its vault (FR-17, `connector.profiles`).
- Panel: "Connect Claude" (`/panel/connectors`) shows the connector URL, saves the sentence and lists connected apps and
  tokens with revoke; the overview's third step leads there once a folder is shared.
- Isolation proven on two fixture accounts and an unpicked folder (`src/mcp/mcp-endpoint.test.ts`).

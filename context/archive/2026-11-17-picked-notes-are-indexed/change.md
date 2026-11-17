---
change_id: picked-notes-are-indexed
title: "Picked notes are indexed"
status: archived
roadmap_item: VC-10
branch: claude/project-thread-1m438k
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
Every synced note is split into passages and indexed by keyword and by meaning per account in small resumable jobs; changed and removed notes update the index; the panel shows progress, note count, last sync and a failure reason in plain words; the privacy policy states where embeddings are computed.

## Context
Roadmap item VC-10 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-10: Picked notes are indexed
> - **Change ID:** `picked-notes-are-indexed`
> - **Status:** ready
> - **Outcome:** every synced note is split into passages and indexed by keyword and by meaning per account in small
>   resumable jobs; changed and removed notes update the index; the panel shows progress, note count, last sync and a
>   failure reason in plain words; the privacy policy states where embeddings are computed.
> - **Prerequisites:** VC-8
> - **Touches (estimate):** `src/vault/index/**`, `src/app/(panel)/status/**`, one app migration (`vault.passages` with a
>   vector column and a full-text column), `src/lib/legal-documents.ts` (one line), SOFTURE/AI `@softure-ai/llm`
>   (embeddings behind one interface: Workers AI on Cloudflare, an OpenAI-compatible endpoint elsewhere).
> - **Unknowns:**
>   - Embedding model and keyword tokenizer chosen by measurement on mixed-language fixtures (English, Polish, German):
>     top-5 hit rate ≥ 90%. (owner: research; blocks: no)
>   - Whether the chosen embedding service processes in the EU. (owner: research; blocks: no)
>   - Embedding cost per 1,000 notes, recorded for the plan limits in VC-14. (owner: research; blocks: no)
> - **Risk:** search quality is the second plan-level risk; measured before the search tool is built on it.
> - **Baseline:** no index; after: the fixture vault indexes inside the budget, the hit-rate script reports ≥ 90%.
> - **PRD refs:** FR-9, FR-10, NFR-3, G-2

Findings gathered while recording the roadmap:

- The owner's private single-user prototype (outside this repository) offers four read-only tools: `search_vault` (query, optional top folder, mode hybrid|keyword|vector, max_results 1-20, default 8; passages with path and score), `vault_index` (folder, filter, depth, recursive, sort name|recent, max_results; table of contents built at sync time: path, title from frontmatter `title` then first `#` heading then file name, tags, aliases, description from `description`/`summary`, last commit date; folder descriptions from a folder note; case- and accent-insensitive matching), `get_note` (path, Unicode NFC, cut at 60,000 characters) and `vault_status` (note count, searches used of the monthly cap, table of contents date). Every note text is wrapped in untrusted-data markers; server instructions say when to use the tools and in which order (table of contents and read note first, search for content). It syncs incrementally from the last synced commit, skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md`, and caps searches per month. Model the contracts on it; do not copy its code.
- No `@softure-ai/*` package offers embeddings today (`@softure-ai/llm` 0.3.0 covers structured output, text and chat): add an embedding interface there (Workers AI binding on Cloudflare, OpenAI-compatible endpoint elsewhere), in SOFTURE/AI directly.
- Database: Postgres with pgvector (Neon supports it); the prototype used a managed search service with a multilingual embedding model and a trigram keyword tokenizer.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/vault/index/**`, `src/app/(panel)/status/**`, one app migration (`vault.passages` with a vector column and a full-text column), `src/lib/legal-documents.ts` (one line), SOFTURE/AI `@softure-ai/llm` (embeddings behind one interface: Workers AI on Cloudflare, an OpenAI-compatible endpoint elsewhere).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Done
- VC-10: every synced note is split into passages under its headings (about 1,000 characters, at most 200 per note)
  and indexed per account in `vault.passages`: folded text with a `simple` tsvector and trigrams for keywords, and a
  1024-dimension vector for meaning. Steps of at most 20 notes or 20 s, resumable; changed notes are re-indexed,
  removed ones lose their passages by foreign key, a model change re-embeds.
- Embeddings: Workers AI `@cf/baai/bge-m3` through the Worker's `AI` binding on the hosted version; an
  OpenAI-compatible endpoint (`EMBEDDINGS_URL`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_API_KEY`) when self-hosted;
  keyword-only without one. `@softure-ai/llm` 0.4.0 and `@softure-ai/db` 0.1.17 (SOFTURE/AI) carry the embedder and the
  PGlite extensions.
- Hybrid ranking (`searchPassages`, reciprocal rank fusion) for VC-11; keyword top-5 hit rate 100% on the same-language
  queries of the EN/PL/DE fixture, at least 90% hybrid with the fake embedder.
- The panel's Status screen shows the last sync, notes indexed, passages and the failure reason in plain words; the
  privacy policy names Workers AI (history entry 2026-11-18). Evidence:
  `vault-connector/evidence/picked-notes-are-indexed/01-status-screen-after-1280-light.webp` (project files).
- Owner step: `pg_trgm` next to `vector` on Neon and the Workers AI permission on the API token
  (`docs/deployment.md`, Owner steps 2, 7).
- Owner step: on the owner's yes for the paid calls, `npm run index:hit-rate` against bge-m3 (this container reaches no
  model host).

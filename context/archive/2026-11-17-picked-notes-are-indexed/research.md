# Research: picked-notes-are-indexed

## How it works today
- VC-8 copies every picked note into object storage (`createAccountNoteStorage`, keyed prefix) and keeps one row per
  note in `vault.notes` (path, `version` = blob sha, size, title, tags, aliases, description, `changed_at`). Sync runs
  live in `vault.sync_runs` with planned/done counters and an `error_code`; removed notes lose their row in the same
  transaction as the copy (`recordRemoved`).
- Background work is `@softure-ai/jobs`: queues in `src/vault/sync/sync-queues.ts`, handlers in `src/jobs/handlers.ts`,
  one tick a minute from the Worker's Cron Trigger (`worker.ts` `scheduled`) or `scripts/worker.ts` on Node. A step
  enqueues its own continuation; `enqueueJob` with a dedup key merges bursts.
- The panel (`src/app/(panel)/panel/**`) is drawn with `@softure-ai/theme-notion` (Sidebar, PageHeader, Card) per
  `DESIGN.md`; sections are listed in `src/components/panel/panel-sections.ts`, copy in `src/messages/en.ts`.
- The privacy policy is data in `src/lib/legal-documents.ts` with a history; VC-3 left the embedding sentence open.

## What the change needs from SOFTURE packages (gaps fixed in SOFTURE/AI)
- `@softure-ai/llm` 0.3.0 had no embeddings. Added in 0.4.0: `createEmbedder` / `embedTexts` over AI SDK `embedMany`
  with `workersAiEmbeddingModel` (the Worker's `AI` binding) and `openAiCompatibleEmbeddingModel` (any `/embeddings`
  endpoint), and `fakeEmbeddingModel` for tests (SOFTURE/AI change `llm-embeddings-pglite-extensions`).
- PGlite 0.5 makes `vector`, `pg_trgm` and `unaccent` available only when loaded; `CREATE EXTENSION vector` on a plain
  PGlite fails with "extension is not available" (measured). `@softure-ai/db` 0.1.17 adds
  `createTestDatabase(modules, { extensions })`; `vector` comes from `@electric-sql/pglite-pgvector` 0.0.17 (Apache-2.0,
  AGPL-compatible; peer `@electric-sql/pglite` 0.5.16), `pg_trgm` from PGlite's contrib. HNSW indexes work there too.
- CI and the dry-run deploy already run `pgvector/pgvector` images; Neon supports `vector` and `pg_trgm`.

## Unknowns answered
- **Embedding model (OQ-3):** `@cf/baai/bge-m3` on Workers AI for the hosted version: multilingual (100+ languages,
  Polish and German included), 1024 dimensions, input up to 60,000 tokens, $0.0118 per million input tokens
  (Cloudflare model page, read 2026-11-17). Self-hosted: any OpenAI-compatible endpoint (`EMBEDDINGS_URL`), e.g.
  bge-m3 on Ollama or TEI, or a hosted API whose model can answer 1024-dimension vectors. Without one, the index is
  keyword-only and the panel says so.
- **Where embeddings are computed / EU:** Workers AI cannot be pinned to the EU: Cloudflare's Data Localization Suite
  lists Workers AI as not supported for Regional Services (only the Customer Metadata Boundary). The passage text is
  sent to Workers AI for the call and is not stored; the vectors and the whole index are stored in Postgres in the EU
  (NFR-3 covers storage). The privacy policy says exactly that.
- **Keyword tokenizer:** Postgres has no Polish stemmer. The keyword side folds case and accents in code (NFKD plus the
  letters NFKD leaves alone: l with stroke, o with stroke, d with stroke, sharp s and the ae and oe ligatures) and indexes `to_tsvector('simple', …)`; queries match each word as a
  prefix of at most its first five letters (so Polish and German inflections meet), ranked by `ts_rank_cd`, with a
  trigram fallback (`pg_trgm` `word_similarity`) for typos. Folding in code instead of `unaccent` keeps the generated
  column immutable and the same on every host.
- **Vector search without an ANN index:** an HNSW index over all accounts filtered by `user_id` returns too few rows
  for one account (post-filtering); an exact scan of one account's passages is correct and cheap at the plan sizes (a
  few thousand notes). Revisit in VC-14 with the plan limits (pgvector iterative scans or a partial index per plan).
- **Cost per 1,000 notes** (for VC-14): a typical note of 4 KB (~1,100 tokens with the title and heading repeated per
  passage) costs ~$0.000013 to embed; 1,000 notes ~$0.013, a full re-index of a 5,000-note vault ~$0.07. Workers AI
  reports no token counts, so the cost is estimated from text length (4 characters per token), not metered.
- **Hit rate:** cannot be measured with the real model from this container (no Cloudflare account, no route to model
  hosts); the fixture and the script are ready (`npm run index:hit-rate`), and the keyword side is measured in CI on
  the fixture. The run with bge-m3 is an owner step once the Cloudflare account exists.

## Risks
- A large vault re-embeds slowly inside the 45-second tick: steps take at most 20 notes or 20 seconds, then continue.
- Changing the embedding model re-embeds every note (detected per note by `indexed_model`).

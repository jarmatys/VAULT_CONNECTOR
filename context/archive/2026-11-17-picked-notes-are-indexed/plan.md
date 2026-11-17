# Plan: picked-notes-are-indexed

## Approach
Index every synced note per account into `vault.passages` in small resumable `vault.index` jobs: read the copy from
storage, split it into passages under their headings, fold the text for keyword search, embed the passages when an
embedder is configured, and replace the note's passages in one transaction that also stamps the note with the
indexed version and model. Removed notes lose their passages by foreign key. A sync step that copied anything, and the
five-minute check, enqueue the index. A status screen shows indexing progress, the note count, the last sync and a
failure reason in plain words. A hybrid ranking function (keyword and vector, reciprocal rank fusion) is measured on a
mixed-language fixture; VC-11 builds the search tool on it.

## Decisions (auto)
- Embeddings: `@softure-ai/llm` 0.4.0 `createEmbedder`, 1024 dimensions. Hosted: Workers AI `@cf/baai/bge-m3` through
  the Worker's `AI` binding (`env.production.ai` in `wrangler.jsonc`, captured by the `scheduled` handler). Elsewhere:
  `EMBEDDINGS_URL`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_API_KEY` (OpenAI-compatible). Nothing configured: keyword-only.
- Schema (migration 0005, numbered 0004 until VC-20 took that number): extensions `vector` and `pg_trgm` in `public`; `vault.passages` (account, path, ordinal,
  heading, body, folded `search_text`, generated `search_vector`, `embedding vector(1024)` null), GIN on the tsvector
  and on trigrams, no ANN index (exact per-account scan); `vault.notes` gains `indexed_version`, `indexed_model`,
  `indexed_at`; `vault.index_states` keeps an account's last index failure.
- Passages: split at headings, then paragraphs, about 1,000 characters each (hard cut at 1,600), title and heading
  path prepended for embedding and keyword text, at most 200 passages per note (the rest unsearched, the note still
  readable whole). Frontmatter is left out.
- Steps: at most 20 notes or 20 s, embedding once per step; a note is pending when its indexed version or model differs
  from the current one. The write locks the note row and checks its version, so two steps never leave mixed passages.
  Embedding failure: the step retries later (`retryJobLater`) and records the code for the panel.
- Status screen `/panel/status` (sidebar "Status") and a third card on the overview; error codes mapped to plain
  sentences in `en.ts`.
- Privacy policy: one sentence on where embeddings are computed, a new history entry.

## Phases
1. **Packages and schema** (TDD): bump `@softure-ai/llm` 0.4.0 and `@softure-ai/db` 0.1.17, add
   `@electric-sql/pglite-pgvector` (dev), one test-database helper with the extensions, migration 0005. Done when every
   existing test runs on the helper and a test inserts a passage with a vector and finds it by keyword and by distance.
2. **Passages and folding** (TDD): `splitIntoPassages`, `foldForSearch`, `buildKeywordQuery`. Done when tests cover
   headings, long paragraphs, frontmatter, empty notes, the passage cap, Polish/German folding and prefix terms.
3. **The index step** (TDD): `runIndexStep`, store, jobs, sync and check enqueue. Done when tests through
   `runDueJobs` show: a synced vault gets passages with vectors, a changed note re-indexed, a removed note's passages
   gone, another account untouched, a model change re-embeds, keyword-only without an embedder, an embedding failure
   retries and is recorded then cleared, a 1,000-note vault finishes in bounded steps.
4. **Ranking and hit rate**: `searchPassages` (hybrid, RRF), the EN/PL/DE fixture with queries, a test asserting the
   keyword hit rate floor and isolation (no other account, no unpicked note), `npm run index:hit-rate` for a real
   embedder.
5. **Panel and policy**: status page, overview card, sidebar, messages, privacy sentence and history. Done when page
   tests render progress, done, failure and keyword-only states, and a screenshot of the status screen is stored.
6. **Wiring and close**: `wrangler.jsonc` AI binding, `worker.ts`, `.env.example`, `docs/deployment.md`, gates, impl
   review, archive.

## Progress
- [x] Phase 1: packages and schema
- [x] Phase 2: passages and folding
- [x] Phase 3: the index step
- [x] Phase 4: ranking and hit rate
- [x] Phase 5: panel and policy
- [x] Phase 6: wiring and close

Evidence: unit tests (234, typecheck and lint green), Node e2e 34/34 after merging VC-9 against Postgres 16 with pgvector, status screen
`vault-connector/evidence/picked-notes-are-indexed/01-status-screen-after-1280-light.webp` (project files).

# Research: claude-searches-picked-notes

## What exists
- `src/vault/index/search-passages.ts` (VC-10): `searchPassages(db, { userId, query, embedder, limit })` ranks an
  account's passages by words (prefix `to_tsquery('simple')` on the folded text, trigram fallback below five word hits)
  and by meaning (exact `<=>` scan of the account's vectors), fused by reciprocal rank fusion (k = 60, 50 candidates per
  list). It searches every indexed passage of the account: it does not know the current picks or a folder.
- `vault.passages` (migration 0005): one row per passage, `path` per note, GIN on the tsvector and on trigrams. A
  passage is at most 4,000 characters; the splitter targets about 1,000.
- `src/mcp/vault-tools.ts` (VC-9): `vault_index`, `get_note`, `vault_status`; every answer goes through
  `loadSharedNotes` (current picks, NFR-2) and `explainEmpty` (no store, no source, no pick, first sync).
  `src/mcp/catalog.ts` lists the tools for mcp-access's catalog; `expectToolCatalogMatchesServer` keeps them equal.
- `VaultReadContext` carries `db`, the note store and the panel URL; no clock, config or embedder.
- Embedder: `readEmbeddingSettings` + `createIndexEmbedder` (`embedding-settings.ts`); the Worker registers its `AI`
  binding on `fetch` too, so a request can embed the query.
- Instructions (`en.mcp.instructions`): table of contents, read note, status; no search step.

## The monthly allowance
- PRD FR-12/FR-15/FR-18 name `@softure-ai/metering`. Metering 0.4.2 (`runtimes: node, workers`) has per-account month
  budgets in a provider's unit (`requests`), `reserveSpend` refusing with `budget.resetsAt`, `settleSpend`,
  `releaseSpend`, `getSpend` for a status tool, and runtime limits (`setBudgetLimit`) without a deploy. Months start at
  midnight in the config's `timezone` (UTC here). Its own schema and migrations, so no app migration and no collision
  with lane B.
- A reservation takes the provider's advisory lock for a short transaction: every search of every account serialises on
  it for a few milliseconds. Acceptable at launch volume; noted as a follow-up (a per-account lock when only
  per-account budgets apply) rather than changed here.
- VC-14 binds limits to plans later; until then one instance-wide default (`SEARCHES_PER_MONTH`, default 1,000, the
  prototype's order of magnitude), which the operator can also change at runtime through metering.

## Shared-folder scope in SQL
Passages of a note under a folder the account no longer picks may exist until the next sync removes the note. The
search must filter by the current picks, and by the requested folder, in SQL (so `LIMIT` applies after the filter):
`starts_with(path, folder || '/')` for each allowed prefix. `isUnderFolder` uses the same boundary.

## Answer shape (prototype contract, FR-12)
query, optional folder, mode `hybrid | keyword | meaning`, `max_results` 1-20 default 8; each hit: rank, path, heading,
score, passage text, all note text between the untrusted markers. Empty: "no results" echoing the query. Over the
allowance: the reset date; the other tools keep working.

## Risks
- p95 < 3 s on 5,000 notes (NFR-1): measured in a unit test on PGlite (slower than Postgres) with 5,000 notes and
  vectors from the fake model.
- Meaning mode without an embedder: falls back to words and says so, instead of returning nothing.

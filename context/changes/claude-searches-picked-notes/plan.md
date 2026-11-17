# Plan: claude-searches-picked-notes

## Approach
Add the fourth read-only tool, `search_vault`, on top of VC-10's ranking. The ranking gains a mode (hybrid, keyword,
meaning) and a folder scope applied in SQL, built from the account's current picks narrowed by the requested folder.
Every search counts one request against the account's monthly allowance in `@softure-ai/metering` (reserve, then settle
after the search, release on failure); `vault_status` shows the month's use, limit and reset date. The server
instructions put search after the table of contents.

## Decisions (auto)
- Allowance: metering provider `vault-search`, unit `requests`, one per-account month budget, default limit from
  `SEARCHES_PER_MONTH` (1,000 when unset; 0 stops searching). VC-14 replaces the default with plan limits.
- Query 1-500 characters; `folder` must be a shared folder or a folder below one (else an error listing the shared
  folders); results 1-20, default 8.
- Meaning without an embedder or with a failing model answers by words and says so in one line.
- Answer: header (query echoed, mode, folder, count), then per hit `N. path (score 0.0331)` and `## heading`, the passage
  body; the whole list between the untrusted markers. Score printed with four decimals.
- No search when nothing can be read (`explainEmpty`), and those calls do not count.
- `VaultReadContext` gains `clock`, `config` and `embedder`; `getVaultReadContext` builds them.

## Phases
1. **Scoped, moded ranking** (TDD): `searchPassages` takes `scope` (allowed folder prefixes) and `mode`. Done when tests
   show a folder narrows, an unpicked folder's passages never return, keyword skips the model, meaning skips words,
   hybrid fuses both, and an empty scope returns nothing.
2. **Allowance** (TDD): `src/mcp/search-allowance.ts` (provider definition, `SEARCHES_PER_MONTH`, reserve/settle,
   usage for status), metering in `softure.config.ts`, `.env.example`. Done when tests show the count, the refusal with
   the reset date at the limit, a new month resets, and a failed search does not count.
3. **The tool and instructions** (TDD): `search_vault` in `vault-tools.ts`, catalog, messages, instructions,
   status lines; fixture indexes notes. Done when MCP tests (through the endpoint with a bearer token) find the fixture
   answer with path and score inside the markers, narrow by folder, echo an empty query result, refuse over the
   allowance while `get_note` still works, never return another account's or an unpicked note, and the catalog matches.
4. **Performance**: a 5,000-note fixture searched hybrid; p95 of 20 searches < 3 s. Done when the test passes in CI.
5. **Close**: docs (`docs/deployment.md` variable, README tool list if present), gates, impl review, archive.

## Progress
- [ ] Phase 1: scoped, moded ranking
- [ ] Phase 2: allowance
- [ ] Phase 3: the tool and instructions
- [ ] Phase 4: performance
- [ ] Phase 5: close

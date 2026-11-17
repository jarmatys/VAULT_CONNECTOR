# Implementation review: claude-reads-picked-notes (VC-9)

Reviewed: 8488c87, 6a4b22f against `plan.md` (four phases) and `change.md`. Verdict: **approve** (fixes below applied
before the review closed).

## Checked
- **Plan drift:** none in scope. The catalog moved from `src/mcp/server.ts` to `src/mcp/catalog.ts` so that
  `softure.config.ts` (read by scripts, the worker and `softure migrate`) does not load the MCP SDK; the server
  re-uses it. The overview gained a third step ("Connect Claude") as phase 3 asked.
- **Isolation (NFR-2):** every tool reads through `loadSharedNotes`, which takes the account id from the verified token
  and keeps only rows inside the current picks; `get_note` resolves a path only against those rows, so `../`, another
  account's path and an unpicked folder all get the same "not found" answer. Proven by `mcp-endpoint.test.ts` (two
  accounts, an unpicked folder, a removed pick before the next sync); a sabotaged pick filter turns it red.
- **Untrusted data (FR-16):** note text, titles, tags, aliases, descriptions, folder and repository names and the
  account's sentence sit between the markers; a marker inside the text is defused (unit tests).
- **Read-only:** `allowWrites: false`, no write tool, annotations `readOnlyHint: true` with titles; a hand-issued token
  asked with write access comes back read-only; a snapshot of the store and the `vault`/`connector` tables is equal
  before and after every probe.
- **Security:** `/api/mcp`, `/api/oauth/{token,register}` and `/.well-known/oauth-*` stay outside the panel guard;
  the `mcp` and `mcp-oauth` rate limit buckets are registered; the consent decision checks session and origin
  (package). The sentence form checks the session and writes only the caller's row; length is a database constraint
  as well as a code check.
- **Tests:** unit (markers, path resolution, index rendering, sentence store), endpoint and OAuth integration,
  catalog check, e2e on Node (33/33 locally); the Workers host runs in CI.

## Findings
1. *Warning, fixed:* the first index rendering put folder names (vault data) outside the markers in the scope line
   and in the unknown-folder error. Both moved between the markers.
2. *Suggestion, fixed:* "1 notes" in counts; singular and plural forms added.
3. *Suggestion, fixed:* the sentence form's Save was a second primary button next to mcp-access's "Create token";
   it is secondary now (DESIGN.md: one primary action per screen).
4. *Suggestion, fixed:* the server title said "Obsidian notes"; it now says "the notes you shared from your vault"
   (trademark distance in product-facing names).

## Not in scope
Search (`search_vault`) is VC-11; export and deletion of the sentence and tokens with the account is VC-16 (rows go
with the account by foreign key today; mcp-access registers its own privacy contributor).

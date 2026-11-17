# Research: claude-reads-picked-notes

## What exists (master after VC-8)
- `vault.notes` (`src/vault/sync/sync-store.ts`, `listNotes`): one row per copied note with path, version, size, title,
  tags, aliases, description, `changed_at`, `synced_at`. Rows exist only for notes inside a picked folder when written,
  but they stay until the next sync after an unpick: between a change of picks and that sync, a row (and its copy) can
  belong to a folder that is no longer shared.
- `vault.shared_folders` (`listSharedFolders`) and `isPathShared(path, folders)` (`src/vault/folders/shared-folders.ts`):
  the one rule for "is this note shared now". Reading through it closes the window above.
- Copies: `createAccountNoteStorage(storage, keySecret, userId).readNote(path)` (`src/vault/storage/note-storage.ts`);
  the store and secret come from `readVaultStorageSettings(process.env)` (`src/vault/storage/storage-settings.ts`).
  Without them nothing is synced and nothing can be read.
- Sync state: `findSource` (`src/vault/sources/store.ts`), `findLatestRun` and `findOpenRun` (`sync-store.ts`).
- Panel: Notion app shell (`src/app/(panel)/layout.tsx`), sections in `src/components/panel/panel-sections.ts`, copy in
  `src/messages/en.ts`. The proxy guards only `/panel`, so `/api/mcp`, `/api/oauth/*`, `/.well-known/*` and
  `/oauth/authorize` pass untouched.
- The auth pages render inside `PageFrame` of `@softure-ai/theme-notion` (`src/app/(auth)/layout.tsx`), which bridges
  the `--sft-*` tokens: a package page placed there takes the Notion look.

## SOFTURE modules
- `@softure-ai/mcp-access` 0.7.6 (MIT, runtimes `node` and `workers`): `mcp.access_tokens` with hashed `sftmcp_`
  tokens; `createMcpRoute({ createServer, toolListVersion })`; OAuth 2.1 (`oauth.enabled`) with dynamic registration
  (`oauth.registration: "open"`), PKCE S256, refresh rotation, one grant per account and client; consent page
  (`OAuthConsentPage`) naming the client, the redirect target, the account and the access; discovery routes; the token
  page parts (`TokenManager`, `getTokenManagerProps`, `revokeGrantAction`); `MCP_RATE_LIMIT_BUCKETS`; prunes as jobs
  (`mcpAccessJobSchedules`, `mcpAccessJobHandlers`); privacy contributors (export, deletion). `withStrictToolInput` and
  `measureToolList` for a hand-built server.
- `@modelcontextprotocol/server` ^2 is its peer (2.4.0 installed).
- Per-account server instructions: `createMcpServerFactory` takes static `serverOptions`. The endpoint accepts any
  factory plus a `toolListVersion` reader, and `measureToolList` is exported, so a hand-built factory gives per-account
  instructions with sessions still tied to the tool list. No package change needed.

## The reference prototype (owner's private single-user server, not copied)
Four read-only tools with `readOnlyHint` and `openWorldHint: false`; note text between untrusted-data markers;
`vault_index` renders a table of contents (top folders with note counts, last change and folder note description;
`folder`, `filter` folded for case and accents, `depth`, `recursive`, `sort`, `max_results`; output capped at 300 lines);
`get_note` normalises to NFC and cuts at 60,000 characters; instructions say when to use the server and in which order
(table of contents, then read; search for content). Contracts are modelled on it in English for any account.

## Unknowns answered
- **Claude's redirect hosts and protocol versions.** The package accepts any https redirect URI and localhost loopback
  at registration and binds the code to it; the consent page shows the target. The endpoint serves 2025-era clients
  (SSE `message`) and 2026-07-28 clients (JSON). Nothing to pin in the app.
- **The account's sentence (FR-17).** Needs storage. Lane B owns the `vault` schema migrations (VC-10 is adding its own
  now), so the sentence lives in a small app module of lane C: schema `connector`, table `profiles`
  (`user_id`, `vault_description` up to 300 characters, `updated_at`). No collision with lane B.
- **Searches used (FR-15).** Search and its quota are VC-11 and VC-14; `vault_status` reports notes, folders, source and
  the last sync now, and gains the quota line with them.

## Risks
- Leaking a note of an unpicked folder in the window before the next sync: closed by filtering every read through the
  current picks (tested).
- Prompt injection through note text, titles or the account's sentence: everything note-derived or account-written sits
  between markers, and a marker inside the text is neutralised so it cannot close the block early.

# Research: account-connects-dropbox-source

## How sources work today
- `src/vault/sources/source.ts`: the provider-neutral `VaultSource` (getCursor, listTree, readFile,
  listChangesSince) and its closed error union; `SOURCE_KINDS = ["github", "s3"]`.
- `src/vault/sources/store.ts`: one row per account in `vault.sources`, a union by `kind`; each kind's columns are
  set only for that kind (constraints in migrations 0001 and 0004). Switching kind or location drops the picks.
- `src/vault/sources/open-source.ts`: the one dispatcher the sync jobs, the folder picker and the request opener use.
- The sync step (`sync-step.ts`) uses only `getCursor` and `listTree`: it compares the cursor with `synced_cursor`
  and diffs the listing against its copies. `listChangesSince` is not called by the pipeline, so an adapter without
  a change feed may answer `full_resync` (the S3 adapter does).
- Without a push webhook, `vault.sync-check` enqueues a step every five minutes for every connected account with picks.
- The GitHub link flow keeps one-time states in `vault.source_link_states` (sha256 of the state, PKCE verifier, ten
  minutes, bound to the account). Its `github_installation_id` column is GitHub-specific; the table has no kind.

## SOFTURE modules that cover the need
- `@softure-ai/connections` 0.6.0: its OAuth flow (`startAuthorization`, `completeAuthorization`, `getAccessToken`)
  stores connections of the **app** (admin panel, `panelRole`), one row per provider account, not per signed-in user;
  `/github-app` covers users' own GitHub installations only. Per-user OAuth for any provider is not in the package.
  What the package does give is used here: `sealSecret` / `openSecret` / `readKeyring` (the vault keyring
  `VAULT_SOURCE_KEYS`, already used for S3 keys).
- `@softure-ai/core` `requestJson` / `requestBytes`: capped requests with statuses mapped to codes (401/403 refused,
  409 conflict, 429 rate limited with Retry-After, 5xx unavailable).
- `@softure-ai/theme-notion` has `Field`, `Input`, `FieldDescription`, `Card`, `Status`, `PageHeader`: the Dropbox
  screen needs no new kit component.

## Dropbox API (v2) facts the adapter relies on
- OAuth 2 code flow with PKCE: `https://www.dropbox.com/oauth2/authorize` (`response_type=code`,
  `token_access_type=offline` for a refresh token, `scope`, `state`, `code_challenge`), token endpoint
  `https://api.dropboxapi.com/oauth2/token` (`authorization_code`, `refresh_token` grants; the answer carries
  `access_token`, `expires_in` (about four hours), `refresh_token` on the code grant, `scope`, `account_id`).
  Refresh tokens do not rotate and live until revoked (`POST /2/auth/token/revoke`).
- Scoped apps: `files.metadata.read` and `files.content.read` are the read-only pair; the token answer's `scope`
  lists what was granted, so a grant with any write scope can be refused.
- `POST /2/files/list_folder` (`path`, `recursive: true`, `limit` up to 2000) and `/2/files/list_folder/continue`
  (`cursor`): entries tagged `file` (`name`, `path_lower`, `path_display`, `rev`, `size`, `content_hash`), `folder`
  or `deleted`; `has_more`. The root of the grant is the empty path `""` (for an app-folder app, its app folder).
- `path_display` guarantees the case of the last component only; folder entries carry their own `name`, so a stable
  relative path is rebuilt from the folder entries.
- `POST https://content.dropboxapi.com/2/files/download` with `Dropbox-API-Arg: {"path":"rev:<rev>"}` reads one exact
  revision: a file changed since the listing is still readable at its listed revision, removed or replaced revisions
  may not be. Errors: 401 token invalid or expired, 403 no access, 409 an endpoint error (`path/not_found`,
  `path/not_folder`), 429 with `Retry-After`, 5xx.
- Webhooks exist per app, not per account folder; the five-minute check is enough for NFR-5 (ten minutes).

## Unknown from the roadmap: per-account OAuth through `@softure-ai/connections`
Not covered: the package's OAuth connections belong to the app. Adding a generic per-user OAuth client to the package
would be a new capability of its own (tables keyed by user, a callback per provider), larger than this item, and the
GitHub source already does its own link flow on top of the package's crypto. Decision: the Dropbox link flow lives in
`src/vault/sources/dropbox/` on the package's crypto and core's HTTP helpers, like the GitHub link does; the idea of a
per-user OAuth capability in `@softure-ai/connections` is reported to the coordinator, nothing is filed.

## Risks
- Listing a large Dropbox folder every five minutes: 2000 entries per call, so a 10 000-note vault costs five calls per
  check; capped at 50 000 entries like S3 (`source.too_large`).
- A refresh-token call per sync step (the access token is not stored): one extra call per step, no secret at rest
  other than the sealed refresh token.
- Migration number: VC-11 and other lane items may add `0006`; whoever merges second renumbers.

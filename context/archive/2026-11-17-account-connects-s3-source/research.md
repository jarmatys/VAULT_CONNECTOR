# Research: account-connects-s3-source

## How sources work today
- `src/vault/sources/source.ts`: the provider-neutral `VaultSource` (getCursor, listTree, readFile, listChangesSince)
  with a closed error union (`source.disconnected`, `not_found`, `rate_limited`, `unavailable`, `too_large`,
  `unexpected`). `SOURCE_KINDS = ["github"]`.
- `src/vault/sources/store.ts`: one row per account in `vault.sources` (unique `user_id`), typed only as
  `StoredGithubSource`. `saveGithubSource` deletes picks when the repository changes, by comparing
  `github_repository_id` (a NULL column on another kind would never match).
- `kind` is constrained by `CHECK (kind IN ('github'))` (migration 0001); the github columns are nullable with a
  `kind <> 'github' OR ...` constraint, so a second kind needs one migration that widens the check and adds columns.
- Consumers of the stored source: `sync-step.ts` / `sync-jobs.ts` (`openSource(StoredGithubSource)`),
  `folders/load-folders.ts` (calls the GitHub adapter directly), the source, folders and panel pages and
  `mcp/vault-tools.ts` (`repositoryFullName` as the label). The MCP tools read only the copies, so they behave the same
  for any source once the sync copies notes.
- Change detection without webhooks already exists: `vault.sync-check` enqueues a step every five minutes for every
  connected account with picks; the step compares `getCursor()` to `synced_cursor` and stays idle when equal.

## SOFTURE modules that cover the need
- `@softure-ai/files/server` exports `signRequest` (AWS SigV4), `encodeRfc3986` and `EMPTY_PAYLOAD_SHA256`; its S3
  storage does not list objects, so listing (ListObjectsV2, XML) is product code here.
- `@softure-ai/connections/server` exports `readKeyring`, `sealSecret`, `openSecret` (AES-256-GCM keyring with key ids
  and row-bound additional data). The app depends on the package already (github-app). `readKeyring` reads one env
  name, so the vault passes its own variable under that name.
- `@softure-ai/core` `requestBytes` does the capped GET with statuses mapped to codes (401/403 refused, 409/412
  conflict, 429 rate limited, 5xx unavailable).
- `@softure-ai/theme-notion` has `Field`, `Input`, `Label`, `FormGrid`, `Alert`, `PropertyList`: the form needs no new
  kit component.

## Unknown: change detection by listing with ETags on large buckets
S3 has no global revision. The cursor is the SHA-256 of the sorted `(key, ETag)` pairs of the prefix. One
ListObjectsV2 page holds 1 000 keys, so a vault of N objects costs ceil(N/1000) requests per check. A typical vault
(< 5 000 files) is at most 5 requests every five minutes; the adapter caches the listing within one sync step so
`getCursor` and `listTree` share it. A cap of 50 000 objects (50 pages, well under the Workers subrequest limit of
1 000) answers `source.too_large`, like a truncated git tree. ETags of multipart uploads are not content hashes but
still change with the content, which is all the cursor and versions need.

## Risks
- SSRF: the endpoint is user input fetched by the server. Only `https`, no IP literals in private, loopback or
  link-local ranges, no `localhost`, no userinfo. Self-hosted instances with a local MinIO opt in with an environment
  flag.
- A read of an object changed after listing: `If-Match: <etag>` answers 412, read as `source.not_found`, so the item is
  dropped and the next check picks up the new version.
- Keys: never logged, sealed at rest, never sent back to the browser.

## Conflicts with work in flight
VC-10 (lane B) may add migration `0004` too; whichever merges second renumbers.

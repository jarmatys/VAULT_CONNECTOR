# Plan: account-connects-s3-source

## Approach
A second adapter of the vault source interface over the S3 API (path-style ListObjectsV2 and GetObject, SigV4 from
`@softure-ai/files/server`). The account enters endpoint, region, bucket, prefix and a read-only key pair on
`/panel/source/s3`; the app probes the bucket with one listing call, seals the key pair with an AES-256-GCM keyring
(`VAULT_SOURCE_KEYS`, `@softure-ai/connections/server` crypto) bound to the account's row, and stores the source. The
stored source becomes a union by kind; one dispatcher opens any kind for the sync and the folder picker. Change
detection is the existing five-minute check with the listing hash as the cursor.

## Decisions (auto)
- Path-style addressing with an optional base path in the endpoint: works with R2, MinIO, B2, Wasabi and AWS.
- Cursor: `s3-<sha256 of sorted key\tETag lines>`; `listChangesSince` answers `full_resync` (the sync diffs the
  listing against its copies anyway). Version: the ETag without quotes. Keys ending with `/` (folder markers) skipped.
- Cap 50 000 objects per listing (`source.too_large`); file cap 25 MB like git.
- Status mapping: 401/403 disconnected, 404 not found, 412 (If-Match) not found, 429/503 rate limited, other 5xx and
  network unavailable, anything else unexpected.
- Keyring env `VAULT_SOURCE_KEYS` (`<id>:<base64 32 bytes>`, made with `npx softure-connections key`); without it the
  S3 option says the instance is not configured. `VAULT_S3_ALLOW_PRIVATE_ENDPOINTS=1` lets a self-hosted instance (and
  the tests) use `http` and private or loopback hosts.
- The secret is never shown again; changing keys means entering the form again (same flow as connecting).
- Switching kind or location deletes the picks (nothing shared before a pick), as switching repositories does.
- Folder picker copy that named GitHub becomes source-neutral where it applies to every kind.

## Phases
1. **Adapter** (TDD): `src/vault/sources/s3/s3-source.ts`, `s3-listing.ts` (XML), `s3-location.ts` (validation), an
   in-memory S3 fake `src/vault/testing/fake-s3.ts` that checks SigV4, and a reusable source contract
   `src/vault/sources/source-contract.ts` run against the S3 adapter. Done when the contract and the error, cap,
   pagination, marker and SSRF tests pass.
2. **Store, sealing and dispatch** (test-after on PGlite): migration `0004_add_s3_sources.sql`, `store.ts` union and
   `saveS3Source`, `s3/s3-credentials.ts`, `s3/connect.ts` (validate, probe, seal, save), `sources/open-source.ts`,
   sync jobs and folder picker on the dispatcher, labels in the panel and MCP status. Done when tests cover a sealed
   row that does not open for another account, a probe refused, switching from git to S3 dropping picks, and a sync
   of picked S3 notes end to end on the fake.
3. **Panel and e2e**: `/panel/source/s3` form (client form, server action), the source screen offering both kinds and
   showing an S3 source, a fake S3 in `e2e/fake-services.mjs`, `e2e/source-s3.spec.ts`, docs (`docs/deployment.md`,
   `.env.example`, wrangler secrets). Done when e2e connects a bucket, picks a folder and sees it in the picker, and
   the gates are green.

## Progress
- [x] Phase 1: adapter (3530cb6). `npx vitest run src/vault/sources/s3` green: source contract at a prefix and at
  the bucket root, pagination over 2 500 keys, the object cap, odd key names, wrong secret, status mapping, probe.
- [x] Phase 2: store, sealing and dispatch (8b0f6a2). `npx vitest run src/vault` green (154 tests): sealed key opens
  only for its account, refused probe stores nothing, git to S3 drops picks, sync of picked bucket notes end to end
  on the fake, idle check costs one list call, a 403 marks the source disconnected.
- [x] Phase 3: panel and e2e (bd13111). `npm run e2e` on Node with a local Postgres: 35 of 35 green, including
  `e2e/source-s3.spec.ts` (refused key reported, bucket connected and named, folders listed from the bucket, one
  shared). Gates: typecheck, lint, `npm test` 291 of 291. The workerd run is left to CI (`e2e on Workers`).

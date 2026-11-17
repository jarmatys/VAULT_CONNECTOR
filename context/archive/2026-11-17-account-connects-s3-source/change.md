---
change_id: account-connects-s3-source
title: "An account connects an S3 source"
status: archived
roadmap_item: VC-20
branch: claude/project-thread-u21k0k
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
An account enters an S3-compatible endpoint, bucket, prefix and read-only keys (stored encrypted); the picker, sync, index and tools behave as with git; change detection works without push webhooks.

## Context
Roadmap item VC-20 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-20: An account connects an S3 source
> - **Change ID:** `account-connects-s3-source`
> - **Status:** ready
> - **Outcome:** an account enters an S3-compatible endpoint, bucket, prefix and read-only keys (stored encrypted); the
>   picker, sync, index and tools behave as with git; change detection works without push webhooks.
> - **Prerequisites:** VC-8
> - **Touches (estimate):** `src/vault/sources/s3/**`, `src/app/(panel)/source/s3/**`.
> - **Unknowns:**
>   - Change detection by listing with ETags on large buckets within the budget. (owner: research; blocks: no)
> - **Risk:** widens the segment (users of S3-based sync plugins); lowest-risk extra source, so it goes first.
> - **Baseline:** git only; after: the source contract tests pass for the S3 adapter against a local S3-compatible store.
> - **PRD refs:** FR-23, G-6

Findings gathered while recording the roadmap:

- Vault sources in order (`docs/planning-context.md`): git, headless sync, Dropbox and S3-compatible storage.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/vault/sources/s3/**`, `src/app/(panel)/source/s3/**`.
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Done
- VC-20: an account connects an S3-compatible bucket (R2, MinIO, B2, Wasabi, AWS) on `/panel/source/s3`: endpoint,
  region, bucket, the vault's folder and a read-only key pair. One listing call checks it before anything is stored; the
  key pair is sealed with AES-256-GCM under `VAULT_SOURCE_KEYS`, bound to the account.
- The stored source is a union by kind (`vault.sources`, migration `0004_add_s3_sources.sql`); one opener serves the
  sync, the folder picker, the panel and the MCP status. Switching kind or location drops the picks.
- Change detection without webhooks: the five-minute check compares a hash of the listing (keys and ETags); reads send
  `If-Match`. A refused key marks the source disconnected. Caps: 50 000 objects, 25 MB a file.
- Endpoint guard: https only, no private or local hosts unless `VAULT_S3_ALLOW_PRIVATE_ENDPOINTS=1` (self-host);
  connecting is rate limited per account.
- Tests: the source contract (`src/vault/testing/source-contract.ts`) against a SigV4-checking fake S3, sync end to end
  on PGlite, and `e2e/source-s3.spec.ts` on both hosts.

- Owner step: generate `VAULT_SOURCE_KEYS` (`npx softure-connections key`) and add it to the `production` environment's
  secrets (`docs/deployment.md`, Owner steps 6); the Worker requires it from this release on.

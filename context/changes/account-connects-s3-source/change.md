---
change_id: account-connects-s3-source
title: "An account connects an S3 source"
status: planned
roadmap_item: VC-20
branch: claude/project-thread-u21k0k
created: 2026-11-17
updated: 2026-11-17
archived_at: null
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

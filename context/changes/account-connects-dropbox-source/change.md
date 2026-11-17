---
change_id: account-connects-dropbox-source
title: "An account connects a Dropbox source"
status: new
roadmap_item: VC-21
branch: null
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Intent
An account connects Dropbox through OAuth with read-only access to one folder; the picker, sync, index and tools behave as with git.

## Context
Roadmap item VC-21 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-21: An account connects a Dropbox source
> - **Change ID:** `account-connects-dropbox-source`
> - **Status:** ready
> - **Outcome:** an account connects Dropbox through OAuth with read-only access to one folder; the picker, sync, index
>   and tools behave as with git.
> - **Prerequisites:** VC-20; a Dropbox app registered by the owner.
> - **Touches (estimate):** `src/vault/sources/dropbox/**`, `src/app/(panel)/source/dropbox/**`.
> - **Unknowns:**
>   - Per-account OAuth through `@softure-ai/connections` (the gap fixed in VC-6 covers it, or extend it). (owner:
>     research; blocks: no)
> - **Risk:** after S3 because it shares the "no push" change detection.
> - **Baseline:** two sources; after: the source contract tests pass for the Dropbox adapter against a fake API.
> - **PRD refs:** FR-24, G-6

Findings gathered while recording the roadmap:

- Vault sources in order (`docs/planning-context.md`): git, headless sync, Dropbox and S3-compatible storage.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/vault/sources/dropbox/**`, `src/app/(panel)/source/dropbox/**`.
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

---
change_id: plan-limits-enforced
title: "Plan limits are enforced"
status: new
roadmap_item: VC-14
branch: null
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Intent
Plans carry limits (notes, storage, searches a month); a sync over the note limit indexes up to it and says so in the panel and the status tool; a search over the allowance is refused with the reset date while the other tools keep working; embedding spend is recorded per account.

## Context
Roadmap item VC-14 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-14: Plan limits are enforced
> - **Change ID:** `plan-limits-enforced`
> - **Status:** ready
> - **Outcome:** plans carry limits (notes, storage, searches a month); a sync over the note limit indexes up to it and
>   says so in the panel and the status tool; a search over the allowance is refused with the reset date while the other
>   tools keep working; embedding spend is recorded per account.
> - **Prerequisites:** VC-11
> - **Touches (estimate):** `src/lib/plans.ts`, `src/vault/limits/**`, `src/mcp/tools/status.ts`,
>   `softure.config.ts` (billing plans, metering entries).
> - **Unknowns:**
>   - Limit values per plan, from VC-10's cost measurement; placeholders until the owner sets prices (OQ-2). (owner:
>     owner; blocks: no)
> - **Risk:** keeps the hosted cost bound to paying accounts (NFR-6) before payment opens.
> - **Baseline:** no limits; after: tests hit each limit and check the messages.
> - **PRD refs:** FR-18, NFR-6, G-4

Findings gathered while recording the roadmap:

- `@softure-ai/billing` plans carry `limits`; `@softure-ai/metering` 0.4.x records paid provider calls and enforces budgets per account.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/lib/plans.ts`, `src/vault/limits/**`, `src/mcp/tools/status.ts`, `softure.config.ts` (billing plans, metering entries).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

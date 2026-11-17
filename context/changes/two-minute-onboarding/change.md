---
change_id: two-minute-onboarding
title: "Two-minute onboarding"
status: new
roadmap_item: VC-12
branch: null
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Intent
A new account is guided through connect source → pick folders → wait for the index → add to Claude (copyable URL and steps) → first question, with an optional sentence about what its vault holds that the server instructions carry; the timed e2e on the fixture vault takes two minutes or less.

## Context
Roadmap item VC-12 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-12: Two-minute onboarding
> - **Change ID:** `two-minute-onboarding`
> - **Status:** ready
> - **Outcome:** a new account is guided through connect source → pick folders → wait for the index → add to Claude
>   (copyable URL and steps) → first question, with an optional sentence about what its vault holds that the server
>   instructions carry; the timed e2e on the fixture vault takes two minutes or less.
> - **Prerequisites:** VC-11
> - **Touches (estimate):** `src/app/(panel)/onboarding/**`, `src/app/(panel)/page.tsx`, `src/mcp/instructions.ts`
>   (account sentence), `messages/en.ts` (onboarding).
> - **Unknowns:**
>   - Which part of the two minutes is waiting for the index, and whether `get_note` and `vault_index` answer before the
>     index is done. (owner: research; blocks: no)
> - **Risk:** G-2 is the product's headline; it waits for search because the timer stops at the first answer.
> - **Baseline:** no guided flow; after: the timed e2e reports the duration on both hosts.
> - **PRD refs:** FR-5, FR-17, G-2

Findings gathered while recording the roadmap:

- Pain 2 (setup beyond non-developers) and pain 5 (the assistant does not know it has the tool), `docs/planning-context.md`.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/app/(panel)/onboarding/**`, `src/app/(panel)/page.tsx`, `src/mcp/instructions.ts` (account sentence), `messages/en.ts` (onboarding).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

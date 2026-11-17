---
change_id: two-minute-onboarding
title: "Two-minute onboarding"
status: planned
roadmap_item: VC-12
branch: claude/project-thread-6s0opx
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

## Notes

- Frame skipped: the outcome is fixed by FR-5, FR-17 and G-2, and research found no cheaper framing (the sentence,
  the connector URL and the status screen exist; what is missing is the guidance, the wait and the measurement).

## Decisions (auto)

- The guided flow lives on the panel's overview (`/panel`), where registration lands, not on a separate route: one
  screen with five steps, each step's card active as soon as its prerequisite is done.
- The optional sentence is asked inside the "Add to Claude" step, saved by an onboarding action that returns to the
  overview; the "Connect Claude" screen keeps its own form.
- "Add to Claude" counts as done once a connected app or token of the account has been used (mcp-access's
  `lastUsedAt`). The first question is not tracked (no extra write per tool call); the step shows the question to ask.
- Saving the picks runs the vault's sync and index queues once right away, after the response (`after()`), instead of
  waiting up to two Cron ticks; the scheduled tick stays the fallback.
- The copy button is a new kit component, `CopyButton` in `@softure-ai/theme-notion` 0.24.0 (SOFTURE/AI), per the
  owner's order that new UI components go into the shared kit.
- The timed e2e runs on both hosts against a writable fake S3 note store; its duration is reported as a test annotation
  and must be at most 120 s.

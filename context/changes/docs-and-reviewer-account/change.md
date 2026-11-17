---
change_id: docs-and-reviewer-account
title: "Docs and the reviewer account"
status: new
roadmap_item: VC-17
branch: null
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Intent
Public docs pages (getting started, tools, privacy and security, self-hosting, FAQ) are served and listed for agents; an operator command prepares a reviewer account with a fixture vault and a time-limited sign-in; the directory checklist (remote HTTPS, OAuth, tool titles and read-only hints, privacy policy, docs, test account, prompt-injection statement) is recorded in the docs with evidence. Ends `done_code` with `Owner step:` submit the connector to the Claude directory.

## Context
Roadmap item VC-17 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-17: Docs and the reviewer account
> - **Change ID:** `docs-and-reviewer-account`
> - **Status:** ready
> - **Outcome:** public docs pages (getting started, tools, privacy and security, self-hosting, FAQ) are served and
>   listed for agents; an operator command prepares a reviewer account with a fixture vault and a time-limited sign-in;
>   the directory checklist (remote HTTPS, OAuth, tool titles and read-only hints, privacy policy, docs, test account,
>   prompt-injection statement) is recorded in the docs with evidence. Ends `done_code` with `Owner step:` submit the
>   connector to the Claude directory.
> - **Prerequisites:** VC-3, VC-12, VC-16
> - **Touches (estimate):** `content/docs/**`, `src/app/(site)/docs/**`, `scripts/ops/reviewer-account.ts`,
>   `softure.config.ts` (agent-ready entry).
> - **Unknowns:**
>   - Current directory requirements at submission time. (owner: research; blocks: no)
> - **Risk:** the directory is the main channel; a missing requirement delays the listing.
> - **Baseline:** no docs; after: e2e opens every docs page; the reviewer command creates a working account in tests.
> - **PRD refs:** FR-21, FR-16, G-3

Findings gathered while recording the roadmap:

- Claude directory requirements known so far (`docs/planning-context.md`): remote HTTPS, OAuth 2.0, `title` and `readOnlyHint` per tool, privacy policy, documentation, a test account for the reviewer.
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `content/docs/**`, `src/app/(site)/docs/**`, `scripts/ops/reviewer-account.ts`, `softure.config.ts` (agent-ready entry).
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

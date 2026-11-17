---
change_id: chatgpt-uses-same-connector
title: "ChatGPT uses the same connector"
status: archived
roadmap_item: VC-19
branch: claude/project-thread-afbqpy
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17
---

## Intent
The server works as a connector in ChatGPT (its OAuth and protocol expectations met), the docs explain adding it, and no price or upgrade appears inside ChatGPT; access ends point to the product's site only.

## Context
Roadmap item VC-19 (`context/foundation/roadmap.md`, hosted-product v1):

> ### VC-19: ChatGPT uses the same connector
> - **Change ID:** `chatgpt-uses-same-connector`
> - **Status:** ready
> - **Outcome:** the server works as a connector in ChatGPT (its OAuth and protocol expectations met), the docs explain
>   adding it, and no price or upgrade appears inside ChatGPT; access ends point to the product's site only.
> - **Prerequisites:** VC-11, VC-15
> - **Touches (estimate):** `src/mcp/server.ts`, `src/app/api/oauth/**` (redirect hosts), `content/docs/chatgpt.md`.
> - **Unknowns:**
>   - ChatGPT's current requirements for remote MCP connectors and app submission. (owner: research; blocks: no)
> - **Risk:** the second channel; small code, but its rules on payment shape the expired-access message.
> - **Baseline:** Claude only; after: an MCP client test with ChatGPT's redirect host completes OAuth and lists tools.
> - **PRD refs:** FR-25, G-6

Findings gathered while recording the roadmap:

- ChatGPT directory: no in-app sales; payment on the product's own site (`docs/planning-context.md`).
- PRD v1 (`context/foundation/prd.md`) holds the acceptance of every FR cited above; shape notes
  (`context/foundation/shape-notes.md`) hold the core rule, rabbit holes and no-gos.

## Constraints
- Owns exclusively (estimate): `src/mcp/server.ts`, `src/app/api/oauth/**` (redirect hosts), `content/docs/chatgpt.md`.
- Do not start before the owner writes "<!-- language: pl -->realizuj roadmapę<!-- /language -->" in the project chat (AGENTS.md, standing orders).
- Public repository: no personal data, server addresses, account ids or secrets; tests use fictional vaults only.
- Tools stay read-only; note text is untrusted data (AGENTS.md, standing orders).
- A gap in an `@softure-ai/*` package is fixed in SOFTURE/AI directly and kept generic (owner, 2026-11-16).

## Notes
- `frame` skipped: the item is small and its framing (same server, payment only on the site) is settled by the PRD
  (FR-25) and ChatGPT's published rules; research found no competing explanation to test.

## Done
- ChatGPT connects over the same OAuth (DCR, PKCE S256, `resource`, RFC 9207 `iss`) with both of its redirect URIs;
  tools declare `securitySchemes`; nothing an assistant reads names a price, upgrade or payment, and an ended access
  points to the product's website; docs in `content/docs/chatgpt.md`.
- Owner step: none for this item (ChatGPT directory submission comes with the hosted launch, VC-23 checklist).

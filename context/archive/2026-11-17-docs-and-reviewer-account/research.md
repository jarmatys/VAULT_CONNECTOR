# Research: Docs and the reviewer account (VC-17)

## Directory requirements at submission time
The Claude connector directory's review criteria (claude.com connector docs, "review criteria", read 2026-11-18):
remote server over HTTPS; OAuth for sign-in; every tool with a `title` and `readOnlyHint`/`destructiveHint`, names of
64 characters or fewer; descriptions free of prompt-injection patterns (no instructions about other tools or the
assistant's behaviour); actionable errors; a public privacy policy; public documentation; test credentials for a fully
populated account. This settles the roadmap's only unknown: the list in `docs/planning-context.md` plus the
description and test-data points.

## What exists
- MCP endpoint `/api/mcp` (VC-9) with mcp-access OAuth 2.1, dynamic registration, S256, consent naming read-only
  access; four tools in `src/mcp/vault-tools.ts`, each with `READ_ONLY` annotations and a title
  (`src/mcp/mcp-endpoint.test.ts` asserts both). Note text wrapped by `src/mcp/untrusted.ts`.
- Privacy policy and terms (VC-3), footer links (`src/components/legal-footer.tsx`).
- `content/docs/chatgpt.md` (VC-19) only; no docs route.
- Accounts: `@softure-ai/auth` `registerUser`, `createTemporaryPassword`; billing `extendTrialManually`; privacy
  `eraseUserData` (VC-16 wired every contributor, the vault copies included).
- Sources: github, s3, dropbox (`SOURCE_KINDS`, a database check). A new fixture source kind would need a migration;
  a seeded copy without a source is deleted by the sync (`removeOrphanedCopies`). The S3 source with the operator's own
  read-only bucket gives a fixture vault with no new code path: `connectS3Source`, `loadFolderPicker`,
  `saveSharedFolders`, `enqueueVaultSync`.

## SOFTURE modules
- `@softure-ai/agent-ready` 0.2.3: API catalog, OpenAPI, auth.md, JWKS, MCP server card, A2A card, agent skills, AI
  catalog, Web Bot Auth directory, `nextHeaders`, `buildAiCatalogLink`, `/testing` guards. Introspecting documents take
  the MCP server factory through `createAgentReadyRoutes({ createServer })`.
- `@softure-ai/theme-notion`: PageHeader, List, Card, Code exist; nothing styles rendered Markdown. Gap for any app
  with a long read: a `Prose` component, added to the kit in SOFTURE/AI (0.25.0) per the owner's design-kit order.

## Risks
- The account's MCP factory reads the database (the account's sentence); discovery documents must not query it with
  an anonymous identity. A discovery factory builds the same tools and instructions without the database.
- Markdown with raw HTML: render with `html: false`, content read at build time only.

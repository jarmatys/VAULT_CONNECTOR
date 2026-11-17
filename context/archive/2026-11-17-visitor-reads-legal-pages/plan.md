# Plan: visitor-reads-legal-pages (VC-3)

## Approach
Two pages, `/privacy` and `/terms`, in the `(site)` route group, each a `LegalDocument` from `@softure-ai/privacy/ui`
with the text from a legal dictionary and the version and history from one declaration list. A site footer in the root
layout renders `LegalFooter` with the privacy, terms and source links and the builder's credit, so every route group
(site, panel, anything later) carries it.

## Decisions (auto)
- Declarations in `src/lib/legal-documents.ts` in the shape `privacy({ documents })` takes (`{ id, history }`), and a
  small pure function turns one into the `{ version, history }` that `LegalDocument` renders (newest first, version =
  date). The privacy module itself is registered by the item that adds auth (VC-5) or export/deletion (VC-16), with
  this same array; registering it now would pull `auth.users` into this item.
- Legal prose in `src/messages/legal.ts` (exempt from the language gate, like every `messages/` folder), as data:
  sections with paragraphs and lists. Placeholders `{operator}` and `{contact}` are filled from settings.
- Operator identity from the environment: `OPERATOR_NAME`, `OPERATOR_CONTACT` (added to `readSettings`). Unset, the
  pages say "the operator of this instance" and point to the source code for contact; a self-hosted instance sets its
  own. Read at build time like `SOURCE_CODE_URL`.
- The embedding line says where it runs is being decided and that the policy will name it before search goes live
  (VC-10 replaces it and adds a history entry). Mail and payment providers are named by role.
- First history entry: 2026-11-17, "First version."
- Footer: `LegalFooter as="div"` inside the app's own `<footer>` (no separator: the list form spaces the links), note = builder's credit linking to
  armatys.me (DESIGN.md). Styled with the base theme's roles only.

## Phases
1. **Content and pages** (test-after): settings (`OPERATOR_*`), `legal-documents.ts` with its unit test, legal
   dictionary, `/privacy` and `/terms` pages, footer component in the root layout, unit tests (settings, declarations,
   a server render of both pages and the footer checking the required policy topics and the operator fallback). Done
   when typecheck, lint and unit tests are green.
2. **E2E**: `e2e/legal.spec.ts`: from the footer of `/` and of each legal page, open both documents and the source
   link; the version line and the change history are shown. Done when the spec passes on Node and on workerd locally
   and in CI.

## Notes for later items
- VC-5 (or VC-16): register `privacy({ documents: LEGAL_DOCUMENTS })` from `src/lib/legal-documents.ts`.
- VC-10 replaces the embedding placeholder line; the items adding mail and payment name their providers. Each text
  change adds a history entry.
- Owner step: set `OPERATOR_NAME` and `OPERATOR_CONTACT` for the hosted instance (variables, read at build time).

## Progress
- [x] Phase 1: content and pages. `npm run typecheck`, `npm run lint`, `npm test` (35 tests) green.
- [x] Phase 2: e2e. `npm run e2e` 9/9 on `next start`, `npm run e2e:workers` 9/9 on `wrangler dev` (local
      Postgres 16). Screenshots: project files `vault-connector/evidence/visitor-reads-legal-pages/01..03`.

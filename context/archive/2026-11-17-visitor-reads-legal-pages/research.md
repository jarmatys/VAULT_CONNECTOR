# Research: visitor-reads-legal-pages (VC-3)

## Today (master e7ba9d1)
- One page (`src/app/page.tsx`) and the root layout (`src/app/layout.tsx`); no footer, no legal pages, no `(site)` group.
- Copy lives in `src/messages/en.ts`; the language gate exempts any folder named `messages/`, so legal prose and the
  builder's name (with a Polish letter) belong there.
- Settings come from the environment through `src/settings.ts` (`readSettings`); pages are prerendered, so values are
  read at build time (the home page already reads `SOURCE_CODE_URL` this way).
- Modules: `ops()` only. Unit tests run in Vitest (`src/**/*.test.ts(x)`, node environment); e2e runs the built app on
  Node and on workerd (`e2e/`, both Playwright configs read the same folder).

## Module: @softure-ai/privacy 0.2.3
- `/ui`: `LegalDocument` (sections, version line, change history; accepts a `document` of shape
  `{ version, history }` newest first), `LegalFooter` (`links`, `note`, `as`, `separator`). Server components, no
  client JavaScript. Labels come from `privacyMessages.en.legal` (root export).
- Root: `privacy({ documents: [{ id, history: [{ date, summary }] }] })` normalises the declarations, and
  `getLegalDocument(config, id)` from `/server` reads them. Registering the module brings its `privacy.consents`
  table, which references `auth.users`: it needs the auth module, which arrives with VC-5.
- Gap check: none. The UI parts take the declaration shape directly, so the app can hold the declarations now and
  hand the same array to `privacy({ documents })` when the module is registered.

## Requirements (PRD FR-2, NFR-3, G-1, G-3)
- Every page: links to the privacy policy, the terms and the source code. DESIGN.md adds the builder's credit.
- The policy names what is stored (copies of picked folders, the index, account data), where (EU), the processors,
  retention after deletion, no training, how to delete.
- The operator's legal identity comes from configuration, not the repository (roadmap unknown).
- Where embeddings run is decided in VC-10: a placeholder line that VC-10 completes.
- Facts to state (docs/planning-context.md, AGENTS.md): Workers on Cloudflare, R2 in the EU jurisdiction, Postgres in
  an EU region through Hyperdrive; folders only after the user picks them; read-only tools; source credentials read
  only to sync. Mail and payment providers are not chosen yet: named by role, completed by the items that add them.

## Risks
- VC-2 (landing, waitlist) and VC-5 (accounts, panel) run in parallel and also touch the root layout,
  `src/messages/en.ts` and `softure.config.ts`. Keep the footer in its own component and the legal copy in its own
  dictionary file, so the shared files get a few additive lines only.

# Plan: account-signs-up-to-panel (VC-5)

## Approach
Adopt `@softure-ai/auth` (password, reset, GitHub with `openSignUp`), `@softure-ai/mailing`, `@softure-ai/security` and
`@softure-ai/feature-switches` with their one-line pages; add the panel layout and an empty panel naming the next step.
Settings that differ between hosts and instances (mail sender, mail key, GitHub client, rate-limit fallback) come from
the environment through `src/settings.ts`, unit-tested. E2E on both hosts with a fake GitHub and a mail outbox.

## Decisions (auto)
- One GitHub App for sign-in and the source (research.md); env `GH_AUTH_CLIENT_ID` / `GH_AUTH_CLIENT_SECRET`; the
  provider is configured only when both are set, so an instance without GitHub shows no button.
- `openSignUp: true` (auth 0.2.17): anyone with a verified GitHub email signs up; registration closed blocks new
  GitHub accounts too.
- Consent: the password form requires the consent box (auth default). A GitHub sign-up shows the same terms in a line
  next to the button. Storing consents is privacy's job (VC-16, `recordRegistrationConsent`); nothing is stored now.
- Panel at `/panel`, guarded by the proxy (`createAuthGuard`, prefix `/panel`) and by `requireUser` in the layout.
  The next step "Connect your vault" is shown without a link; VC-6 adds its screen and the button.
- Mail: `resend()` when `RESEND_API_KEY` is set, else the fake provider (outbox URL in tests; refuses otherwise, so no
  mail disappears silently). Sender `MAIL_FROM`, default a placeholder on example.com until the domain exists.
- Rate limits keyed by `CF-Connecting-IP`; `RATE_LIMIT_SHARED_FALLBACK=1` (dev, tests without an edge) counts
  unidentified requests under one key. Self-hosting's resolver is VC-18's.
- Registration switch defined in feature-switches with `failMode: "open"` (a failed read keeps it closed). No switches
  panel yet: the env override and the stored value are the switch; an operator panel comes with the admin surface.
- `GH_AUTH_FAKE_ORIGIN` test seam accepted only for `http://localhost` / `127.0.0.1`.

## Phases
1. **Modules and settings** (test-after): dependencies (auth 0.2.17, mailing, security, feature-switches), settings
   for mail, GitHub and the fallback with unit tests, `softure.config.ts` entries, `oidc.fetch` seam with a unit test.
   Done when typecheck, lint, unit tests are green and `npm run migrate` creates the module tables.
2. **Pages and panel**: `(auth)` pages, the OIDC callback and session routes, `proxy.ts`, `(panel)` layout and page,
   copy in `messages/en.ts`. Done when the pages render under `next dev`.
3. **E2E on both hosts**: fake services helper (GitHub, mail sink), specs for register → panel → sign out → sign in,
   GitHub sign-up and sign-in, password reset by mail, the guard, closed registration (serial). Done when
   `npm run e2e` and `npm run e2e:workers` pass locally and in CI.
4. **Docs**: `.env.example`, CONTRIBUTING (local run), owner steps (GitHub App, Resend key, sender domain).

## Progress
- [x] Phase 1: modules and settings (29304a9). typecheck, lint, 26 unit tests green; `npm run migrate` applied the
  auth and feature-switches tables (15 migrations) on a local Postgres 16.
- [x] Phase 2: pages and panel (aa36370). The proxy lives at `src/proxy.ts`: Next only reads a proxy next to the app
  directory, and one at the root left OpenNext's build failing on a missing `server/middleware.js`; `src/proxy.test.ts`
  holds the place and the redirect.
- [x] Phase 3: e2e on both hosts (42f4d8e). `npm run e2e`: 13 passed; `npm run build:cloudflare && npm run e2e:workers`:
  13 passed (local Postgres, container Chromium). CI: see the pull request.
- [x] Phase 4: docs (694278e). `.env.example`, CONTRIBUTING (local run), owner steps in change.md.

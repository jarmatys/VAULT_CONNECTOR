# Research: account-signs-up-to-panel (VC-5)

## Today
- The app (VC-1) has one module (`ops()`), the health routes, a placeholder home page, `src/settings.ts` (env with local
  defaults), `src/messages/en.ts`, Playwright on `next start` and on `wrangler dev`, CI with Postgres (pgvector).
- No accounts, no mail, no rate limits, no switches.

## SOFTURE modules that cover the item
- `@softure-ai/auth` 0.2.x: register with consent, login, logout, sessions, password reset (`passwordReset.send`),
  the `auth.registration_closed` switch, the route guard (`@softure-ai/auth/proxy`), one-line pages
  (`LoginPage`, `createRegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`), GitHub sign-in (`type: "github"`,
  callback `/api/auth/oidc/github/callback`, fake `createFakeGithubProvider` in `/testing`). Runs on Workers since
  0.2.14.
- `@softure-ai/mailing`: `resend()` provider, `fakeMailProvider({ outboxFile, outboxUrl })` for tests; on Workers the
  fake posts each mail to a sink (SOFTURE/AI `examples/next-app/e2e/mail-outbox-sink.mjs`). `mailingResetSender()`
  from `@softure-ai/auth/mailing` sends the reset link.
- `@softure-ai/security`: rate limit buckets (`AUTH_RATE_LIMIT_BUCKETS`), `cloudflareIp()`; a request with no
  `CF-Connecting-IP` is refused unless `unidentified: { key }` is chosen for a stack with no edge.
- `@softure-ai/feature-switches`: stores switch values (`features.switches`); auth reads its registration switch
  through it once it is defined there; env override `SOFTURE_SWITCH_AUTH_REGISTRATION_CLOSED`.
- `@softure-ai/testing/playwright`: `clientAddressHeaders()` (a random `CF-Connecting-IP` per test), `uniqueEmail`,
  `waitFor`, `createTestDatabaseClient`.

## Gap found
- A GitHub provider requires `allowedDomains` or `allowedEmails`; a public product lets anyone sign up. Fixed in
  SOFTURE/AI: `openSignUp: true` (auth 0.2.17, SOFTURE/AI change `auth-open-sign-up`): any verified email, account
  creation only while registration is open (`auth.oidc_registration_closed` otherwise).

## Unknown: one GitHub OAuth App for sign-in and a GitHub App for the source (VC-6), or one GitHub App?
- GitHub recommends GitHub Apps over OAuth Apps (fine-grained permissions, short-lived tokens). A GitHub App has its
  own client id and secret and the same web flow (`/login/oauth/authorize`, PKCE supported), so auth's GitHub provider
  works with it unchanged; its user token reads `/user/emails` when the App has the "Email addresses: read" account
  permission. Scopes are ignored for a GitHub App (the permissions decide).
- One App: one registration, one consent screen, one secret pair to rotate, and "Request user authorization during
  installation" lets VC-6 install on the vault repository and sign in in one trip (helps G-2, two minutes).
- Two apps: a sign-in that never shows repository permissions; a leaked sign-in secret is unrelated to repository
  access. The user token issued at sign-in is used for two reads and never stored (auth), so the extra reach of one App
  is not kept anywhere.
- **Decision:** one GitHub App for both. The code reads only `GH_AUTH_CLIENT_ID` and `GH_AUTH_CLIENT_SECRET`, so a
  separate OAuth App stays a configuration choice, not a code change. Owner step: register the App (callback
  `<APP_ORIGIN>/api/auth/oidc/github/callback`, account permission "Email addresses: read", contents read-only for
  VC-6) and set the two values; until then they are unset and the GitHub button is hidden.

## Routes
- Roadmap estimate `src/app/(panel)/page.tsx` would map to `/`, the landing page (VC-2). The panel lives at `/panel`:
  `src/app/(panel)/layout.tsx` (session check, header, sign out) and `src/app/(panel)/panel/page.tsx`. Later panel
  screens go under `/panel/...` so one guard prefix covers them.
- Auth pages under `src/app/(auth)/`: `/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/panel/password` is not needed yet (change password is out of FR-4's acceptance).
- Legal pages are VC-3 (`/privacy`, `/terms`); the consent label links there.

## Tests on two hosts
- GitHub's authorize page is a browser navigation to github.com: Playwright routes it (`page.route`) to a local fake.
  The server's calls (token, `/user`, `/user/emails`) go through `oidc.fetch`, which the config points at the fake only
  when `GH_AUTH_FAKE_ORIGIN` is a loopback URL (never in production). The fake wraps `createFakeGithubProvider`.
- Mail on both hosts through the fake provider's `outboxUrl` and a sink, one local helper process for both fakes.
- Rate limits: each test sends its own `CF-Connecting-IP` (`clientAddressHeaders`).

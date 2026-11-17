# Research: visitor-joins-waitlist (VC-2)

## Today
- One placeholder page, `src/app/page.tsx` (title, lead, status, source link, theme switch); copy in
  `src/messages/en.ts`; `softure.config.ts` has `ops()` only. Settings from the environment in `src/settings.ts`.
- e2e runs the same suite on Node (`next start`) and on workerd (`wrangler dev`), both against Postgres in CI.

## What covers the need
- `@softure-ai/waitlist` 0.5.4: table, consent scopes from config, consent evidence in privacy's ledger, welcome mail
  through mailing's ledger, rate-limited action, `<Waitlist placement>`. Depends on `security`, `mailing`, `privacy`
  (which needs `auth`); the config must hold all four.
- `@softure-ai/mailing` 0.2.8: `resend()` or `fakeMailProvider({ outboxFile, outboxUrl })` from `/testing`; the fake
  refuses under `next start` without an outbox, so no mail silently disappears. List mail needs
  `MAILING_UNSUBSCRIBE_SECRET`; without it the welcome mail is refused and the sign-up stands. The unsubscribe page and
  the RFC 8058 route ship in `/next`.
- `@softure-ai/analytics` 0.3.5: cookieless funnel (`funnel_counts` per day, channel, step), pixel step, server step
  through `countFunnelStep("waitlist")` as the waitlist's `onJoined`, `countRegistration("signup")` for auth later,
  `getFunnelReport(ctx, { days })` for the operator.
- `@softure-ai/seo` 0.2.3: `robots.txt` naming AI crawlers, `sitemap.xml`, both dynamic so the origin is read at runtime.
- `@softure-ai/agent-ready` 0.2.3: every document (API catalog, OpenAPI, server card, A2A card, skills, AI catalog)
  is built by introspecting the app's MCP server. The app has none until VC-11/VC-12; VC-17 already owns the
  agent-ready entry.
- Reference wiring: SOFTURE/AI `examples/next-app` (config, routes, the Workers mail outbox sink, e2e).

## Answers to the unknowns
- Welcome mail without a sending domain: `resend()` only when `RESEND_API_KEY` is set, otherwise the fake provider;
  the sender comes from `MAIL_FROM` with a placeholder default. Owner step: sending domain and key (roadmap already
  lists it for VC-2 and VC-5).
- "A duplicate address is answered as known": the module answers a new and a known address alike on purpose (no
  enumeration). The success copy "You're on the list" is true for both; the test asserts the same answer twice and one row.

## Risks
- `softure.config.ts` is edited by VC-3 (privacy documents) and VC-5 (auth options) in parallel: the second to merge
  resolves; this change keeps `auth()` bare and declares only the `privacy-policy` document.
- Workers share no disk with the test: mail reaches the outbox through a small sink, as in the reference.

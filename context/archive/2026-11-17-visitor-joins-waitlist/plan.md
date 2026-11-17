# Plan: visitor-joins-waitlist (VC-2)

## Approach
Adopt the modules as the SOFTURE/AI reference app wires them, reduced to gate 0: the landing page at `/` in a
`(site)` route group with the promise, the five pains and their answers, the source link, the waitlist form and the
funnel pixel; mailing with the fake provider until the owner sets a sending domain; the cookieless funnel with a
small operator report; robots and sitemap from seo. Everything is tested on both hosts.

## Decisions (auto)
- Single opt-in (the module's default): the PRD asks for a welcome message right after the sign-up, and no job runner
  exists yet to prune unconfirmed sign-ups. Double opt-in can be switched on later without data loss.
- One required scope `launch` ("Email me when the hosted version opens", tied to `privacy-policy`); no newsletter.
- Funnel steps: `landing` (pixel, `/` only), `waitlist` (server, the waitlist's `onJoined`), `signup` (server; VC-5
  hooks `countRegistration("signup")` into auth). No proxy and no channel keeper yet: one public page, and the join
  action reads the channel from the page it was sent from (`resolveChannel: getChannel`). VC-5 adds the proxy with
  its auth guard.
- Operator view of the funnel: `npm run funnel -- --days=<n>` prints per-day counts per step (the report is
  cumulative; a pure function turns consecutive windows into days). An admin page needs auth roles (VC-5 onward).
- Agent discovery: robots.txt names the AI crawler categories (all allowed, `/api` closed) and sitemap.xml lists the
  landing page. The agent-ready documents need an MCP server to introspect, so they come with VC-17, which owns the
  agent-ready entry; recorded as a deferral, not a gap.
- Mail sender from `MAIL_FROM` (placeholder default on `example.invalid`); `resend()` only with `RESEND_API_KEY`.
- Fonts (Ubuntu via `next/font`) stay open: fetching them at build time ties the build to Google's servers; the
  system fallback stays until the design pass of VC-17.

## Phases
1. **Modules and landing** (test-after): dependencies, `softure.config.ts`, settings (`MAIL_FROM`), the `(site)`
   landing page and copy, unsubscribe page and route, funnel route, robots and sitemap; unit tests for settings,
   the config (scopes, steps, buckets) and the copy (five pains). Done when typecheck, lint and unit tests are green.
2. **Funnel report**: pure per-day function with unit tests, `scripts/funnel-report.ts`, `npm run funnel`.
3. **e2e on both hosts**: mail outbox (file on Node, sink on workerd), specs for the landing, the sign-up (welcome
   mail, consent row, repeat answer, missing consent refused, nothing stored), the funnel counts and robots/sitemap.
   Done when `npm run e2e` and `npm run e2e:workers` pass locally and in CI.
4. **Docs**: README/CONTRIBUTING env vars, DESIGN.md landing note.

## Progress
- [x] Phase 1: modules and landing. `npm run typecheck`, `npm run lint`, `npm test` (31 tests) green; `npm run migrate`
      applies 19 module migrations on a fresh Postgres 16. Screenshots: `project files: vault-connector/evidence/visitor-joins-waitlist/01-landing-after-1280-light.webp`,
      `02-landing-after-1280-dark.webp`, `03-landing-after-390-light.webp`.
- [x] Phase 2: funnel report. `splitFunnelDays`/`formatFunnelDays` unit-tested; `npm run funnel -- --days=3` prints three
      rows on the local database, `--bad` exits 2 with the usage line.
- [x] Phase 3: e2e on both hosts. `npm run e2e` 12/12 on `next start`, `npm run e2e:workers` 12/12 on `wrangler dev`
      (local Postgres 16, mail through the outbox sink). The "server step from outside" test seen red with a pixel step.
- [x] Phase 4: docs. CONTRIBUTING (settings table, `npm run funnel`), DESIGN.md (landing surface, fonts left open).

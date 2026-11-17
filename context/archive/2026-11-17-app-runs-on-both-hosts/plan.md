# Plan: app-runs-on-both-hosts (VC-1)

## Approach
Copy the two-host shape of SOFTURE/AI `examples/next-app`, reduced to what VC-1 needs: the `ops` module only, the
health routes, observability, the Flat Paint theme with the amber accent, a placeholder home page, the gates and the
two-host e2e in CI. Settings come from the environment through one small pure module (`src/settings.ts`), so the host
switch and the defaults are unit-tested.

## Decisions (auto)
- `src/` layout (`src/app`, `src/instrumentation.ts`); config files at the root as in the reference.
- Modules: `ops()` only. Every later item adds its own module (auth, waitlist, mcp-access...).
- Accent as an app-side override (theme kit's documented way), with `brand-theme.ts` as the source of the values and a
  test that holds `brand.css` equal to it and measures WCAG contrast. Values from DESIGN.md: fill `#f2b84b`, hover
  `#e5a832`, deep `#8a5a00`, ink text `#0c0c0d`.
- Fonts are not loaded yet (system fallback); the landing-page change loads Ubuntu with `next/font`.
- PGlite is not installed; `wrangler.jsonc` aliases its imports to `@softure-ai/db`'s refusing stand-in, the same one
  `withDatabaseBuild` uses for the Next bundle. The generic fix (the `init --host=cloudflare` template writing that
  alias) belongs with VC-4, which generates the deploy's `wrangler.jsonc`.
- CI on `ubuntu-latest` (public repository), Postgres `pgvector/pgvector:pg16`, Playwright's own Chromium.
- `context/workflow.json`: `typecheck`, `lint`, `test` gates set; `migrations` stays `null` (no app migrations yet).
- The roadmap row ends `done_code`: nothing is deployed until the owner's release.

## Phases
1. **App and gates** (test-after): package.json, configs, settings, health routes, worker, theme, home page, unit
   tests (settings, accent), ESLint, lefthook, vitest. Done when typecheck, lint and unit tests are green.
2. **Two hosts and CI**: Playwright configs for `next start` and `wrangler dev`, e2e for health and the home page
   (accent in both schemes), `checks.yml` jobs. Done when `npm run e2e` and `npm run e2e:workers` pass locally and in CI.
3. **Docs**: DESIGN.md accent final, CONTRIBUTING.md local run, workflow.json gates.

## Progress
- [x] Phase 1: app and gates. `npm run typecheck`, `npm run lint`, `npm test` (17 tests) green; the CSS drift test
      seen red with one value changed. Commit f41c21f.
- [x] Phase 2: two hosts and CI. `npm run e2e` 4/4 on `next start`, `npm run e2e:workers` 4/4 on `wrangler dev`
      (local Postgres 16); health 503 `{"status":"unavailable"}` with an unreachable database. CI: PR #3. Commit f41c21f.
- [x] Phase 3: docs. Commit f41c21f.

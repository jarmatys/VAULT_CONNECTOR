# Research: app-runs-on-both-hosts (VC-1)

## Question
What does the smallest app need so that one codebase runs on `vps+node` and `cloudflare+workers`, with health,
observability, the product's accent, the gates and a two-host e2e in CI, using only `@softure-ai/*` building blocks?

## Findings
- **Reference shape:** SOFTURE/AI `examples/next-app` runs one codebase on both hosts: `SOFTURE_HOST=cloudflare`
  switches `platform` in `softure.config.ts` and the build in `next.config.ts` (`withDatabaseBuild` from
  `@softure-ai/db/next-config`); `worker.ts` wraps OpenNext's handler in `withRequestDatabase` (Hyperdrive URL) and
  `withObservability`; `playwright.workers.config.ts` serves the OpenNext build with `wrangler dev` and points the
  local Hyperdrive at the CI Postgres through `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. No
  Cloudflare account is needed. Its CI (`.github/workflows/e2e.yml`, jobs `e2e` and `e2e-workers`) is the template.
- **Health:** `@softure-ai/ops` ships `GET /api/health` (`export { GET } from "@softure-ai/ops/next"`) with the
  database check and every module's; `detail: "status"` (default) answers `{ status }` only, 503 when a check fails.
  `createBuildInfoRoute` and `withBuildInfo` give `GET /api/health/build`.
- **Observability:** `registerObservability` in `instrumentation.ts` on Node; `withObservability` in `worker.ts` on
  Workers; nothing is exported without `OTEL_EXPORTER_OTLP_ENDPOINT`. On Node `@softure-ai/observability` must stay in
  `serverExternalPackages`; on Cloudflare nothing may stay external.
- **Accent (unknown 1):** `@softure-ai/theme-flat-paint` takes no accent option, but the theme kit documents the
  override ("Overriding in an app"): redefine the CSS variables after `theme.css` for both schemes, or
  `extendTheme(theme, { colors })`. The generated `theme.css` declares the roles in three selector blocks (default
  light, system dark unless light was chosen, chosen dark). The base's look maps and `page.css` also paint with the
  palette names `lime`, `lime-hover`, `lime-deep`, and the `selected-row` shadow holds the lime literally, so those are
  overridden too. **No SOFTURE/AI change is needed.**
- **pgvector and PGlite (unknown 2):** CI can use `pgvector/pgvector:pg16` as the Postgres service now, so the items
  that add the vector index (VC-10) need no CI change. PGlite ships `@electric-sql/pglite/vector`; whether unit tests
  use it is decided by the first item with a vector schema (VC-10). VC-1 has no app tables.
- **Measured gap:** `worker.ts` imports `@softure-ai/db/request`, whose client has literal dynamic imports of
  `@electric-sql/pglite` and `drizzle-orm/pglite`. Inside the SOFTURE/AI monorepo the example resolves them from the
  root `node_modules`; a standalone app without PGlite fails `wrangler dev` bundling ("Could not resolve
  @electric-sql/pglite"). `withDatabaseBuild` already aliases both to a refusing stand-in for the Next bundle; the
  Worker entry needs the same alias in `wrangler.jsonc`.
- **Measured:** with `instrumentation.ts` at the root of a `src/` app, the OpenNext build failed at runtime
  ("Failed to load chunk ... for chunk server/instrumentation.js"); in `src/instrumentation.ts`, Next's convention for a
  `src` layout, both hosts start.

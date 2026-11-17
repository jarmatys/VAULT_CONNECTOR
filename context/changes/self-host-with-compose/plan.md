# Plan: self-host-with-compose

## Approach
Adopt the `@softure-ai/deploy` container recipe (Dockerfile, migrate and worker bundles, roles recipe) and add one
root `docker-compose.yml` for self-hosters: Postgres with pgvector, SeaweedFS as the S3-compatible note store with a
one-off bucket step, the one-off migration, the app and the worker, all configured from `.env`. The client address
behind the self-hoster's proxy becomes a setting. A CI workflow builds the stack and runs the whole e2e suite against
it, through a small override that puts the app on the runner's loopback next to the fake services.

## Decisions (auto)
- One image for app, migrate and worker, built locally by `docker compose build` (no published image yet; a registry
  image is a later owner decision). `OPERATOR_NAME`/`OPERATOR_CONTACT` are build arguments because the legal pages
  are prerendered.
- Postgres `pgvector/pgvector:pg16`; init creates `vector` and `pg_trgm` as the superuser, then the ops roles recipe;
  the app runs as `softure_app`, migrations as `softure_migrator`. No port published in the base file.
- Note store: SeaweedFS 4.51 single server with one identity from `.env`; `storage-init` (curl with SigV4) creates the
  bucket. `VAULT_STORAGE_DIR` stays documented as the simpler alternative.
- Client address: `CLIENT_IP_SOURCE` = `cloudflare` (default, the hosted instance), `forwarded-for` (with
  `TRUSTED_PROXY_HOPS`, default 1) or `header:<name>`; the compose file defaults to `forwarded-for`.
- Embeddings: an OpenAI-compatible endpoint (`EMBEDDINGS_URL`, 1024-dimension model) or keyword-only by default.
- The app is published on `127.0.0.1:${APP_PORT:-3000}`; TLS and the public address are the self-hoster's proxy
  (the guide shows Caddy).
- CI (`.github/workflows/self-host.yml`, every pull request and master): build, `up --wait`, `npm run e2e:compose`
  (`playwright.compose.config.ts`: fake services only, the app is the stack), logs on failure.
- Repository guards in `docker/compose.test.ts`: images pinned, required variables documented in `.env.example` and
  `docs/self-hosting.md`, no published Postgres port, app/worker/migrate share one image.

## Phases
1. **Client address setting** (TDD): `src/client-ip-settings.ts` + tests; `softure.config.ts` uses it. Done when tests
   cover the three sources, the default and malformed values.
2. **Image** (test-after): `Dockerfile`, `.dockerignore`, `scripts/migrate.ts`, worker health file, standalone switch in
   `next.config.ts`. Done when `docker build` succeeds locally and `node migrate.mjs`/`worker.mjs --health` run.
3. **Compose stack and guide** (test-after): `docker-compose.yml`, `docker/postgres/initdb/*`, `docker/storage/*`,
   `.env.example`, `docs/self-hosting.md`, README link, guards. Done when `docker compose up -d --wait` is healthy
   locally and the guard tests pass.
4. **CI e2e on the stack**: `docker/compose.e2e.yml`, `scripts/self-host/e2e-env.ts`, `playwright.compose.config.ts`,
   `.github/workflows/self-host.yml`. Done when the workflow is green on the pull request.
5. **Close**: gates, impl review, archive, `done_code`.

## Progress
- [ ] Phase 1: client address setting
- [ ] Phase 2: image
- [ ] Phase 3: compose stack and guide
- [ ] Phase 4: CI e2e on the stack
- [ ] Phase 5: close

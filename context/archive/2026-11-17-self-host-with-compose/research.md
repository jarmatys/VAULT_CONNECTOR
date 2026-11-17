# Research: self-host-with-compose

## What exists (master 53ae075)
- The app already runs on Node (`vps` host, `next start`) and its job worker is `scripts/worker.ts`
  (`runJobWorkerProcess`, which supports a `healthFile` and `--health`).
- Every self-host setting is an environment variable already: database (`DATABASE_URL`), origin (`APP_ORIGIN`), mail
  (`RESEND_API_KEY`, `MAIL_FROM`, outbox for tests), GitHub sign-in and App (`GH_AUTH_*`, `GH_APP_*`,
  `GH_WEBHOOK_SECRET`), note store (`VAULT_S3_*` or `VAULT_STORAGE_DIR`, `VAULT_STORAGE_KEY_SECRET`), source keys
  (`VAULT_SOURCE_KEYS`), embeddings (`EMBEDDINGS_URL`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_API_KEY`), operator
  (`OPERATOR_NAME`, `OPERATOR_CONTACT`, read at build time by the prerendered legal pages), alerts, admins, OTLP.
- **Keyword-only search (the item's unknown) is settled:** `readEmbeddingSettings` returns `none` without
  `EMBEDDINGS_URL`, the index stores passages without vectors and `search_vault` answers by words (VC-10, VC-11).
  Vectors are 1024 wide (`bge-m3`), so a self-hosted model must produce 1024 dimensions.
- The vault migration runs `CREATE EXTENSION vector` and `pg_trgm`; with the ops recipe's least-privilege migrator
  role that needs the extensions created first by the superuser.
- Rate limits read only `CF-Connecting-IP` (`cloudflareIp()`); `softure.config.ts` says the compose stack picks its own
  resolver. `@softure-ai/security` has `forwardedForIp` and `headerIp`.
- e2e: Playwright starts the fake services (GitHub, S3, mail outbox) on 127.0.0.1:3199; the app must reach them on
  loopback (`GH_AUTH_FAKE_ORIGIN` accepts loopback only) and the tests reach Postgres directly. Every request carries
  `cf-connecting-ip` from `@softure-ai/testing`.

## SOFTURE modules
- `@softure-ai/deploy` 0.7.3 `init` renders the ops container recipe: a standalone Next build, `migrate.mjs` and
  `worker.mjs` bundled with esbuild, a non-root user and the image's health check. Its compose file and `deploy.sh` are
  for an operator's SSH deploy with Traefik, which a self-hoster does not need, so only the Dockerfile,
  `.dockerignore`, `scripts/migrate.ts` and the roles recipe (`initdb/01-roles.sql`, byte for byte from
  `@softure-ai/ops`) are taken.
- S3-compatible store: SOFTURE/AI's own backup integration test runs SeaweedFS (`chrislusf/seaweedfs:4.51`, Apache-2.0)
  with an `s3.json` of identities and creates the bucket with a signed `PUT`. MinIO no longer publishes images.

## Risks
- A runtime DDL by the app role fails under the two-role recipe; the compose e2e catches it.
- The standalone build may miss a file a package reads at run time; the compose e2e catches it.
- Host networking for the e2e override only (fake services on loopback); the base file uses the compose network.

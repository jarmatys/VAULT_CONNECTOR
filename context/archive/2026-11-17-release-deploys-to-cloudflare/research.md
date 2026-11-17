# Research: release-deploys-to-cloudflare (VC-4)

## What exists (master e7ba9d1, after VC-1)
- `wrangler.jsonc`, `worker.ts`, `open-next.config.ts`, `cloudflare-sockets.d.ts`: written by VC-1 for local
  `wrangler dev` only (Hyperdrive `id: "local"` with a local connection string, PGlite alias, `SOFTURE_HOST` var).
  `worker.ts` already matches what `init --host=cloudflare` generates for an app with `@softure-ai/db` and
  `@softure-ai/observability` (request database on Hyperdrive, `withObservability`, health route out of the traces).
- `npm run build:cloudflare` sets `SOFTURE_HOST=cloudflare`; the action's default build command
  (`npx opennextjs-cloudflare build`) does not, so the release must pass `build-command: npm run build:cloudflare`.
- `npm run migrate` is `softure migrate` on `softure.config.ts`; no `scripts/migrate.ts` is needed (the action's
  default migrate command would need one and `tsx`).
- No deploy, release or backup workflow; `checks.yml` runs typecheck, lint, unit tests and e2e on both hosts.

## What SOFTURE/AI gives (deploy@0.7.1, commit 20f608b on both `deploy@0.7.1` and `backup@0.1.1`)
- `softure-deploy init --host=cloudflare --domain=<host>` writes `wrangler.jsonc` (custom domain route, Hyperdrive id
  or placeholder, Smart Placement, `secrets.required`), `worker.ts`, `scripts/migrate.ts`, `deploy.yml`, `backup.yml`,
  `backup-verify.yml`, `deploy.json`. Output generated into the scratchpad and used as the base of every file here.
- `.github/actions/deploy-cloudflare`: check → tag on release branch → build → migrate → `wrangler deploy
  --secrets-file` → `softure-deploy verify` → `wrangler rollback` on a red verify → `deploy-report` artifact. Inputs
  `wrangler` (command split on spaces), `wrangler-env`, `build-command`, `migrate-command`, `deploy-config`, `report`.
  There is no "test mode" input; SOFTURE/AI tests it with a fake `wrangler` on PATH.
- `.github/workflows/deploy-cut-release.yml`: the caller pattern for `auto-release.yml` (date tag, release, starts the
  deploy workflow with `-f tag=`).
- `.github/actions/backup-cloudflare`: `softure-backup run` records each run in `backup.runs`; without the table the
  run fails, so the app must adopt the `backup()` module.

## Measured
- `wrangler deploy --dry-run --env production` bundles the Worker offline with a placeholder Hyperdrive id and a
  `.invalid` domain (6.0 MiB raw, 1.3 MiB gzip); it accepts `--secrets-file` but does **not** enforce
  `secrets.required` (empty file, one required name: exit 0). The dry run must check that itself.
- `wrangler dev --local-protocol https --https-key-path --https-cert-path` serves the OpenNext build over https with a
  throwaway certificate; `softure-deploy verify https://localhost:8787` passes `/api/health` and `/` with
  `NODE_EXTRA_CA_CERTS` pointing at it, once the HSTS header check is removed (Cloudflare's edge sends HSTS, not the app).
- `backup()` in `softure.config.ts` fails the Cloudflare build: `module "backup" does not run on the workers runtime`.
  Cause: `@softure-ai/backup` 0.1.1 lists `.` and `./server` as Workers-safe in `package.json` but its manifest has no
  `runtimes`. Generic gap, fixed in SOFTURE/AI (backup 0.1.2), with the init template's missing PGlite alias
  (deploy 0.7.2) in the same pull request.
- Neon's default major is 17; `postgres:17` lacks pgvector, which the restore of a dump with `CREATE EXTENSION vector`
  needs, so the restore check uses `pgvector/pgvector:pg17`.

## Constraints that shape the design
- Public repository: neither the domain nor the Hyperdrive id may be committed, but `wrangler.jsonc` is static and
  wrangler has no flag for a Hyperdrive id. A wrapper renders them from the environment into an ignored copy.
- Release only on the owner's word; scheduled backups must not fail nightly before production exists.

# Plan: release-deploys-to-cloudflare (VC-4)

## Approach
Adopt `softure-deploy init --host=cloudflare` (0.7.1) output, adjusted to this app: the release is SOFTURE/AI's
`deploy-cloudflare` action called from `release.yml` with the app's own build and migrate commands and a `wrangler`
wrapper that fills the public repository's placeholders. A dry-run workflow runs the same action on a fake account in
every pull request. Backups adopt the `backup()` module and the generated workflows, gated until production is live.

## Decisions (auto)
- File names from the roadmap: `release.yml` is init's `deploy.yml` (deploy on a published release or a dispatched
  tag); `auto-release.yml` calls `deploy-cut-release.yml` with `deploy-workflow: release.yml`, Warsaw dates.
- `wrangler.jsonc` keeps the top level for local `wrangler dev` (VC-1's e2e) and gets `env.production` for the deploy
  (`--env production`), with `name` pinned so the Worker is not renamed, no workers.dev and no preview URLs.
- Placeholders `__APP_DOMAIN__` and `__HYPERDRIVE_ID__`, filled by `scripts/deploy/wrangler.ts` from the variables
  `APP_DOMAIN` and `HYPERDRIVE_ID` of the `production` environment; the wrapper validates both and refuses leftovers.
  Written in TypeScript and run with Node's type stripping, so its logic is unit-tested.
- Dry run (`WRANGLER_DRY_RUN=1`): the wrapper checks `secrets.required` against the secrets file and runs `wrangler
  deploy --dry-run`; rollback only prints. The action's verify runs against the same build on `wrangler dev` over https
  with a throwaway certificate; the HSTS check is removed from the dry-run copy of `deploy.json` only.
- All SOFTURE/AI references pinned to `20f608b3fbcaf9ec0baf1006cad6b3efcf068e2d` (tag `deploy@0.7.1`).
- `backup()` added to `softure.config.ts` (append only) with `@softure-ai/backup` ^0.1.2, after the SOFTURE/AI fix is
  released. Scheduled backup and backup-verify run only when the repository variable `PRODUCTION_LIVE` is `true`.
- `backup-verify.yml` restores into `pgvector/pgvector:pg17`; the dry run's Postgres is pgvector pg17 too (Neon's major).
- No secret is required by the Worker yet; `secret-names` stays empty and a guard test holds `secrets.required`,
  the step's `env:` and `secret-names` together for later items.
- No `scripts/migrate.ts`: `npm run migrate` is the migrate command.
- The PGlite alias stays in the app's `wrangler.jsonc`; the generic fix goes to the init template (deploy 0.7.2).

## Phases
1. **Release path** (test-after): `wrangler.jsonc` production env, `scripts/deploy/wrangler.ts` with unit tests,
   `deploy.json`, `release.yml`, `auto-release.yml`, `deploy-dry-run.yml`, guard tests on the workflows.
   Done when typecheck, lint, unit tests are green and the dry run passes locally (bundle + verify) and in CI.
2. **Backups**: SOFTURE/AI fix released (backup 0.1.2, deploy 0.7.2); `backup()` adopted; `backup.yml`,
   `backup-verify.yml`. Done when the Cloudflare build and both e2e suites are green with `backup()`.
3. **Docs**: `docs/deployment.md` with the release path, values and every owner step.

## Progress

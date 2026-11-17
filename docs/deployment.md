# Deployment (hosted instance on Cloudflare)

How the hosted instance is released, verified, rolled back and backed up, and every step only the owner can take.
A self-hosted instance does not need any of this: it runs the same code on Node with Docker Compose (roadmap item
VC-18). No value below is written into this public repository; each lives in a GitHub Environment or variable.

## The path of a release

| Step | Where | What happens |
| --- | --- | --- |
| Cut | `.github/workflows/auto-release.yml` | "Run workflow" on `master` creates the next date tag (`vYYYY.MM.DD`, then `-2`, `-3`) and its GitHub Release, then starts `release.yml` on the tag. |
| Check | `release.yml` → SOFTURE/AI `deploy-cloudflare` | The inputs are well formed, the checkout is the tag's commit and that commit is on `master`. |
| Build | `npm run build:cloudflare` | The OpenNext build for Workers (`SOFTURE_HOST=cloudflare`). |
| Migrate | `npm run migrate` on the runner | `softure migrate` over `MIGRATE_DATABASE_URL`, the direct URL of the migrator role. Migrations move forward only, so a release must run on the schema of the one before it. |
| Deploy | `node scripts/deploy/wrangler.ts deploy --env production` | The wrapper fills `APP_DOMAIN` and `HYPERDRIVE_ID` into a copy of `wrangler.jsonc` and runs `wrangler deploy` with the Worker's secrets as one version. |
| Verify | `softure-deploy verify https://$APP_DOMAIN --config=deploy.json` | `/api/health` answers `{"status":"ok"}`, `/` renders, HSTS is sent and `X-Powered-By` is not. |
| Roll back | `wrangler rollback` | Only when verify fails after a deploy: the previous version (code and secrets) serves again; the job stays red. The database is not rolled back. |
| Report | SOFTURE/AI `deploy-report.yml` | The run's facts go into the tag's GitHub Release. |

"Run workflow" on `release.yml` with an existing tag deploys that tag again (a redeploy, or a rollback to an older
release whose schema the database still fits).

A release happens only on the owner's word (`release.owner: true` in `context/workflow.json`). A session may start
`auto-release.yml` once the owner has asked for that release; it never pushes a tag.

### The dry run on every pull request

`.github/workflows/deploy-dry-run.yml` runs the same action the same way, on a fake account and without secrets: a
local tag, the release's build, a real migration on a Postgres service with pgvector, `wrangler deploy --dry-run` on
the production configuration (with a check that the secrets file holds every `secrets.required` name, which a wrangler
dry run skips), and verify against the same build served by `wrangler dev` over https on localhost. HSTS comes from
Cloudflare's edge, so that one header check runs only in production. A change that would break the release fails
there first.

## Files

| File | Role |
| --- | --- |
| `wrangler.jsonc` | Top level: local `wrangler dev` (e2e). `env.production`: the deployed Worker, with `__APP_DOMAIN__` and `__HYPERDRIVE_ID__` placeholders and `secrets.required`. |
| `scripts/deploy/wrangler.ts` | The `wrangler` of the release: fills the placeholders from the environment, refuses a malformed value, and runs the dry run (`WRANGLER_DRY_RUN=1`). |
| `worker.ts`, `open-next.config.ts` | The Worker entry (request database on Hyperdrive, observability) and the OpenNext build. |
| `deploy.json` | What verify checks after a deploy, and what the backup check counts. |
| `.github/workflows/release.yml` | The deploy (job `deploy`, environment `production`) and the report. |
| `.github/workflows/auto-release.yml` | Cuts a release and starts `release.yml`. |
| `.github/workflows/backup.yml` | Nightly off-site copy of the database (03:17 UTC). |
| `.github/workflows/backup-verify.yml` | Weekly restore of the newest copy into a throwaway Postgres (Monday 05:40 UTC). |
| `.github/workflows/deploy-dry-run.yml` | The release path on a fake account, on every pull request and on `master`. |

SOFTURE/AI's action and workflows are pinned to the commit of the release tag `deploy@0.7.1`
(`20f608b3fbcaf9ec0baf1006cad6b3efcf068e2d`); `scripts/deploy/release-workflows.test.ts` holds every pin and the
`deploy-cli-version` together. Upgrading `@softure-ai/deploy` moves all of them in one change.

## Backups

`backup.yml` dumps the Neon database with `pg_dump` (Postgres 17), encrypts the dump with age to a public key, uploads it
with a write-only token to an R2 bucket in the EU jurisdiction and records the run in `backup.runs` (the `backup()`
module in `softure.config.ts`). `backup-verify.yml` downloads the newest copy with a read-only token, decrypts it with
the private key, restores it into a Postgres with pgvector on the runner, runs the schema guard against the migrations
of `master` and drops it; a copy older than 26 hours fails the run.

Both schedules wait for production: the repository variable `PRODUCTION_LIVE` set to `true` turns them on, so they do
not fail every night before the first deploy. "Run workflow" runs them at any time.

Restore after a loss: `@softure-ai/backup`'s README, sections "Restore and verify" and "After losing the server"
(`npx @softure-ai/backup restore --identity=<key file>` into a new database; never over production without
`--into --overwrite`).

## Values

### Environment `production` (Settings → Environments)

| Name | Kind | What |
| --- | --- | --- |
| `APP_DOMAIN` | variable | The bare host the Worker serves, e.g. the product's domain (no scheme, no path). |
| `HYPERDRIVE_ID` | variable | The id of the Hyperdrive configuration (32 hex characters). |
| `CLOUDFLARE_ACCOUNT_ID` | variable | The Cloudflare account id (32 hex characters). |
| `CLOUDFLARE_API_TOKEN` | secret | A token with "Workers Scripts: Edit" on the account and "Workers Routes: Edit" plus "DNS: Edit" on the zone (the custom domain). |
| `MIGRATE_DATABASE_URL` | secret | The direct (not pooled) Postgres URL of the migrator role, `sslmode=require`. Used on the runner only. |
| `BACKUP_S3_ENDPOINT` | variable | The R2 S3 endpoint of the EU jurisdiction (`https://<account>.eu.r2.cloudflarestorage.com`). |
| `BACKUP_S3_REGION` | variable | `auto`. |
| `BACKUP_S3_BUCKET` | variable | The backup bucket's name. |
| `BACKUP_S3_PREFIX` | variable | The key prefix, e.g. `vaultconnector`. |
| `BACKUP_AGE_RECIPIENT` | variable | The age public key (`age1…`). |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | secrets | The write-only R2 token (Object Write on the backup bucket only). |

The Worker needs no secret yet. A later item that adds one lists it in `env.production.secrets.required` of
`wrangler.jsonc`, as `NAME: ${{ secrets.NAME }}` in the deploy step's `env:` and in `secret-names` of `release.yml`
(the release-workflows test holds the three together), and adds the secret here.

### Environment `backup-verify`

`BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX` (variables, as above);
`BACKUP_S3_READ_ACCESS_KEY_ID`, `BACKUP_S3_READ_SECRET_ACCESS_KEY` (secrets: the read-only R2 token, Object Read on the
backup bucket only); `BACKUP_AGE_IDENTITY` (secret: the age private key, `AGE-SECRET-KEY-1…`). Only `backup-verify.yml`
uses this environment; the private key never reaches the deploy or Cloudflare.

### Repository variable

`PRODUCTION_LIVE` = `true` after the first successful deploy (Settings → Secrets and variables → Actions →
Variables).

## Owner steps

In this order; each is the owner's because it needs an account, money or a secret. Nothing is deployed before the
owner's word for the first release.

1. **Domain and Cloudflare account.** Buy the product's domain on the product's own Cloudflare account (not another
   project's) and keep its zone there. Under SSL/TLS → Edge Certificates turn on "Always Use HTTPS" and HSTS
   (max-age of at least six months), which verify checks.
2. **Neon.** A project in an EU region (e.g. Frankfurt), Postgres 17. Enable `vector` (`CREATE EXTENSION vector;` as
   the owner role). Create two roles: a migrator that owns the schema (its direct URL is `MIGRATE_DATABASE_URL`) and an
   app role the Worker uses (rows only). Until the app role's grants come with a later item, the Hyperdrive
   configuration may use the migrator.
3. **Hyperdrive.** `npx wrangler hyperdrive create vaultconnector --connection-string="<URL of the app role>"` with the
   account's token; put the printed id into `HYPERDRIVE_ID`.
4. **Backup storage.** An R2 bucket with the EU jurisdiction, with an object lock of 30 days and a lifecycle rule
   that deletes objects after 31 days (`npx --package=@softure-ai/backup softure-backup lifecycle` prints the rule). Two R2 API tokens scoped to
   that bucket: write-only (Object Write) for `production`, read-only (Object Read) for `backup-verify`.
5. **Age key pair.** `age-keygen -o vaultconnector-backup.key` on the owner's machine; the public key (`age1…`) is
   `BACKUP_AGE_RECIPIENT`, the file's secret line is `BACKUP_AGE_IDENTITY`. Keep the file offline as well: without it
   no copy can be restored.
6. **API token.** A Cloudflare API token with the permissions in the table above; `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`.
7. **GitHub.** Create the environments `production` and `backup-verify` with the values above. In `production`, limit
   deployment branches and tags to `master` and `v*`, and add the owner as a required reviewer if every deploy should
   wait for a click.
8. **First release.** Actions → `auto-release` → Run workflow on `master`. Watch `release` finish green (migrate,
   deploy, verify); then open `https://<APP_DOMAIN>/api/health`.
9. **Backups on.** Set `PRODUCTION_LIVE=true`, run `backup` once by hand and, after it, `backup verify`; both green.

## Troubleshooting

- **Check step red:** the message names the missing value (`APP_DOMAIN`, `HYPERDRIVE_ID`, `CLOUDFLARE_ACCOUNT_ID`,
  a secret listed in `secret-names`). Set it in the `production` environment and run `release.yml` again on the tag.
- **Deploy step red:** wrangler's own message; the previous version keeps serving.
- **Verify red:** the previous version serves again (`wrangler rollback`); fix forward with a new release.
- **Migrate red:** nothing was deployed; the database may hold the migrations that ran before the failing one, which
  the next release builds on.

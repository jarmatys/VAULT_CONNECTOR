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

SOFTURE/AI's action and workflows are pinned to the commit of the release tag `deploy@0.7.3`
(`7bca0c418aba887517f77ae3f200cc540e0718f5`); `scripts/deploy/release-workflows.test.ts` holds every pin and the
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
| `CLOUDFLARE_API_TOKEN` | secret | A token with "Workers Scripts: Edit" and "Workers AI: Read" on the account and "Workers Routes: Edit" plus "DNS: Edit" on the zone (the custom domain). |
| `MIGRATE_DATABASE_URL` | secret | The direct (not pooled) Postgres URL of the migrator role, `sslmode=require`. Used on the runner only. |
| `BACKUP_S3_ENDPOINT` | variable | The R2 S3 endpoint of the EU jurisdiction (`https://<account>.eu.r2.cloudflarestorage.com`). |
| `BACKUP_S3_REGION` | variable | `auto`. |
| `BACKUP_S3_BUCKET` | variable | The backup bucket's name. |
| `BACKUP_S3_PREFIX` | variable | The key prefix, e.g. `vaultconnector`. |
| `BACKUP_AGE_RECIPIENT` | variable | The age public key (`age1…`). |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | secrets | The write-only R2 token (Object Write on the backup bucket only). |

The Worker's own values are secrets of the same environment, uploaded with each version (`wrangler deploy
--secrets-file`); `env.production.secrets.required` of `wrangler.jsonc` makes a deploy without one fail. The sender and
the operator are not secret, but the public repository does not name them, so they travel the same way.

| Name | What |
| --- | --- |
| `RESEND_API_KEY` | The mail provider's key, "Sending access" on the product's sending domain only. |
| `MAIL_FROM` | The sender, on that verified domain (e.g. `VaultConnector <hello@…>`). |
| `MAILING_UNSUBSCRIBE_SECRET` | Signs the unsubscribe links of list mail (`openssl rand -hex 32`). |
| `GH_AUTH_CLIENT_ID`, `GH_AUTH_CLIENT_SECRET` | The GitHub App used for sign-in; callback `https://<APP_DOMAIN>/api/auth/oidc/github/callback`. |
| `GH_APP_ID`, `GH_APP_SLUG`, `GH_APP_PRIVATE_KEY` | The same App's id, its URL name and its private key (PEM, newlines kept or escaped as `\n`), used to read the repository an account connects. Permissions: Contents and Metadata read-only; setup URL `https://<APP_DOMAIN>/panel/source/github/setup`, callback also `https://<APP_DOMAIN>/panel/source/github/callback`. |
| `GH_WEBHOOK_SECRET` | The same App's webhook secret (`openssl rand -hex 32`); webhook URL `https://<APP_DOMAIN>/api/webhooks/github`, event "Push" only. A push then syncs at once; without it the five-minute check alone follows the vaults. |
| `VAULT_S3_ENDPOINT`, `VAULT_S3_BUCKET` | The note store: an R2 bucket with the EU jurisdiction (`https://<account>.eu.r2.cloudflarestorage.com`) holding the copies of the shared notes. |
| `VAULT_S3_ACCESS_KEY_ID`, `VAULT_S3_SECRET_ACCESS_KEY` | An R2 API token with Object Read and Write on the note bucket only. |
| `VAULT_STORAGE_KEY_SECRET` | Derives the note keys, which carry no account id or path (`openssl rand -hex 32`, at least 32 characters). Changing it orphans every stored copy, so it is set once. |
| `VAULT_SOURCE_KEYS` | Seals the read-only keys of the S3-compatible buckets accounts connect as their vault source (`npx softure-connections key`). Rotate by putting a new key first and keeping the old one after it; dropping a key makes its accounts re-enter their bucket key. |
| `OPERATOR_NAME`, `OPERATOR_CONTACT` | The operator the privacy policy and the terms name. |
| `ALERTS_MAIL_TO` | Where the operator's alerts go by mail (failing syncs, failed jobs, late schedules, and their recovery). |
| `ADMIN_EMAILS` | The accounts that may open `/admin/jobs` and `/admin/alerts` (comma-separated; register them first). |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | The observability backend's OTLP endpoint and its `Authorization` header (Grafana Cloud: the stack's OTLP gateway and `Authorization=Basic <base64 of instance:token>`). The jobs heartbeat's silence rule reads these logs. |

A later item that adds a Worker secret lists it in `env.production.secrets.required` of `wrangler.jsonc`, as
`NAME: ${{ secrets.NAME }}` in the deploy step's `env:` and in `secret-names` of `release.yml` (the release-workflows
test holds the three together), as a stand-in in `deploy-dry-run.yml`, and adds it here.

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
2. **Neon.** A project in an EU region (e.g. Frankfurt), Postgres 17. Enable `vector` and `pg_trgm` (`CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;`
   as the owner role; the vault migration 0005 creates them too when the role may). Create two roles: a migrator that owns the schema (its direct URL is `MIGRATE_DATABASE_URL`) and an
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
6. **Note store.** A second R2 bucket with the EU jurisdiction, without object lock or expiry, for the copies of
   the shared notes; one R2 API token with Object Read and Write on that bucket only (`VAULT_S3_ACCESS_KEY_ID`,
   `VAULT_S3_SECRET_ACCESS_KEY`), the bucket's name and endpoint, and `VAULT_STORAGE_KEY_SECRET`. For accounts that
   keep their vault in their own bucket, `VAULT_SOURCE_KEYS` (`npx softure-connections key`). On the GitHub App,
   turn on the webhook (URL and secret in the table above, event "Push"). The sync runs from a Cron Trigger every
   minute and reads from GitHub and R2 within one invocation: a Workers Paid plan (higher subrequest and CPU limits)
   is assumed.
7. **Search by meaning.** The Worker's `AI` binding (`wrangler.jsonc`, production) computes the meaning data of
   passages on Workers AI with `@cf/baai/bge-m3`, billed per use (about $0.013 per 1,000 notes of 4 KB; a full
   re-index of a 5,000-note vault about $0.07). It needs the Workers Paid plan. Once the account exists, and only on
   the owner's yes for the paid calls, measure the hit rate on the fixture with a real model:
   `EMBEDDINGS_URL=<an OpenAI-compatible endpoint serving bge-m3> npm run index:hit-rate` (exit 0 at 90% or more). A
   self-hosted instance sets `EMBEDDINGS_URL`, `EMBEDDINGS_MODEL` and `EMBEDDINGS_API_KEY` instead; without them the
   index is keyword-only and the panel says so.
8. **API token.** A Cloudflare API token with the permissions in the table above; `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`.
9. **GitHub.** Create the environments `production` and `backup-verify` with the values above. In `production`, limit
   deployment branches and tags to `master` and `v*`, and add the owner as a required reviewer if every deploy should
   wait for a click.
10. **First release.** Actions → `auto-release` → Run workflow on `master`. Watch `release` finish green (migrate,
   deploy, verify); then open `https://<APP_DOMAIN>/api/health`.
11. **Backups on.** Set `PRODUCTION_LIVE=true`, run `backup` once by hand and, after it, `backup verify`; both green.
12. **Alerts.** On the product's own Grafana Cloud stack create the contact point `VaultConnector operator` (the
    operator's mail), then apply the rules once the first release sends logs: `GRAFANA_URL=… GRAFANA_TOKEN=… npm run
    grafana:alerts` prints the plan, `npm run grafana:alerts -- --commit` applies it. Register the accounts named in
    `ADMIN_EMAILS`, open `/admin/jobs`, and send a test alert: `npx softure-alerts test` with the production values.

## Operator alerts

What tells the operator that background work is broken (VC-13):

- **Three failed syncs in a row for one account** send one alert (mail to `ALERTS_MAIL_TO`, and a JSON POST to
  `ALERTS_WEBHOOK_URL` when a self-hosted instance sets one), and the account's next good sync one recovery. The count
  lives in `operator.sync_failure_streaks`; the alert's key is `vault.sync:<account id>`, never an address.
- **A failed job, a schedule that turns failing or late, a paused queue** come from the jobs' hooks, one alert per
  queue (a sync step's failure is counted per account instead).
- **No successful jobs tick for ten minutes** cannot be told by the jobs themselves. Every tick that runs jobs logs
  one `jobs heartbeat` line a minute under the service `vaultconnector-jobs` (the Worker's scheduled runs and the
  self-hosted worker alike), and Grafana's rule in `grafana/alert-rules.json` fires on its silence and sends the
  recovery when it returns. A second rule fires on `ERROR` lines of the same service.
- `/admin/jobs` shows the queues, schedules and recent jobs; `/admin/alerts` the recent alerts. Both answer "not
  found" to anyone without the `admin` role.

## Troubleshooting

- **Check step red:** the message names the missing value (`APP_DOMAIN`, `HYPERDRIVE_ID`, `CLOUDFLARE_ACCOUNT_ID`,
  a secret listed in `secret-names`). Set it in the `production` environment and run `release.yml` again on the tag.
- **Deploy step red:** wrangler's own message; the previous version keeps serving.
- **Verify red:** the previous version serves again (`wrangler rollback`); fix forward with a new release.
- **Migrate red:** nothing was deployed; the database may hold the migrations that ran before the failing one, which
  the next release builds on.

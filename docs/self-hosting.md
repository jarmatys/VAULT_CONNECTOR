# Self-hosting VaultConnector

VaultConnector runs on your own machine from one Docker Compose file: the app, its background worker, Postgres with
pgvector and an S3-compatible store for the copies of your notes. It is the same code as the hosted version, free under
the AGPL-3.0. Every setting is an environment variable in one `.env` file; nothing else needs editing.

## What you need

- A Linux machine with Docker Engine 24 or later and the Compose plugin (`docker compose version`), 2 GB of memory and
  a few GB of disk for the database and the notes.
- A domain name pointing at that machine, and a reverse proxy that serves it over HTTPS. Assistants connect only to an
  https address; the example below uses Caddy, which gets the certificate by itself.
- A GitHub account to create a GitHub App (sign-in with GitHub and the git vault source), unless your accounts use only
  email and an S3-compatible bucket as their source.
- Optional: a [Resend](https://resend.com) key for mail (password reset, alerts), and an embedding model for search by
  meaning (below).

## Start

```bash
git clone https://github.com/jarmatys/VAULT_CONNECTOR.git vaultconnector
cd vaultconnector
cp .env.example .env
# fill in the required values (next section)
docker compose up -d --build --wait
```

`--wait` returns once Postgres, the note store, the app and the worker are healthy; the migration and the bucket
step run once and exit before the app starts. `docker compose ps` shows the state, `docker compose logs -f app worker`
the logs. Open your domain and register the first account.

### What compose starts

| Service | Image | Role |
| --- | --- | --- |
| `postgres` | `pgvector/pgvector` (Postgres 16) | The database. On first start it creates the `vector` and `pg_trgm` extensions and two roles: a migrator that owns the schema and an app role limited to reading and writing rows. |
| `storage` | `chrislusf/seaweedfs` | The S3-compatible note store, reachable only inside the compose network. |
| `storage-init` | `curlimages/curl` | Creates the note bucket, then exits. |
| `migrate` | built from this repository | Applies the database migrations as the migrator, then exits. |
| `app` | built from this repository | The panel, the MCP endpoint and OAuth for assistants, on port 3000 inside the container. |
| `worker` | built from this repository | The background jobs: syncing vaults, indexing notes, erasing deleted accounts' copies, prunes and alerts. |

Only the app is published, on `127.0.0.1:3000` by default (`APP_BIND`, `APP_PORT`), for a proxy on the same machine.
Postgres and the note store publish no port.

## Configuration

Copy `.env.example` to `.env`; every line there explains itself. The values compose requires (it stops and names the
first one missing):

| Name | What |
| --- | --- |
| `APP_ORIGIN` | The public address, e.g. `https://vault.example.com`. Links, OAuth and the MCP endpoint use it. |
| `POSTGRES_PASSWORD`, `SOFTURE_MIGRATOR_PASSWORD`, `SOFTURE_APP_PASSWORD` | The database passwords. URL-safe, e.g. `openssl rand -hex 32`. Set once, when the volume is created. |
| `MAILING_UNSUBSCRIBE_SECRET` | Signs the unsubscribe links of list mail (`openssl rand -hex 32`). |
| `VAULT_S3_ACCESS_KEY_ID`, `VAULT_S3_SECRET_ACCESS_KEY` | The note store's key pair. You choose both; the store is created with them. |
| `VAULT_STORAGE_KEY_SECRET` | Derives the note keys (`openssl rand -hex 32`, 32 characters or more). Set it once: changing it orphans every stored copy. |

Everything else is optional and documented in `.env.example`: mail (`RESEND_API_KEY`, `MAIL_FROM`), the GitHub App,
bucket sources (`VAULT_SOURCE_KEYS`), the Dropbox source (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`: your own Dropbox app with only
`files.metadata.read` and `files.content.read`, redirect URI `https://vault.example.com/panel/source/dropbox/callback`;
its tokens are sealed with `VAULT_SOURCE_KEYS`), search by meaning, the plans' limits (`PLAN_LIMITS`),
closing registration (`SOFTURE_SWITCH_AUTH_REGISTRATION_CLOSED`), the operator, admins and alerts.

**The operator.** `OPERATOR_NAME` and `OPERATOR_CONTACT` name who runs the instance on the privacy policy and the terms.
Those pages are built into the image, so rebuild after changing them (`docker compose up -d --build --wait`). If you
change the code, set `SOURCE_CODE_URL` to your fork: the AGPL-3.0 asks you to offer the running source to its users.

**No plan limits.** The hosted version caps each account's copied notes, their storage and its searches a month by
plan. Compose sets `PLAN_LIMITS=unlimited`, so a self-hosted instance has none of those limits; set any other value
(for example `PLAN_LIMITS=enforced`) to apply the hosted plans' limits.

**Admins.** Put your email in `ADMIN_EMAILS` (after registering) to open `/admin/jobs` and `/admin/alerts`.

## The reverse proxy and client addresses

Rate limits on sign-in, registration and other forms are kept per client address. The compose file reads it from the
last entry of `X-Forwarded-For`, which one proxy in front appends (`CLIENT_IP_SOURCE=forwarded-for`,
`TRUSTED_PROXY_HOPS=1`). With two proxies in a row (a CDN, then Caddy) set `TRUSTED_PROXY_HOPS=2`; behind Cloudflare
alone set `CLIENT_IP_SOURCE=cloudflare`; a proxy that overwrites one header of its own takes
`CLIENT_IP_SOURCE=header:x-real-ip`. A request whose address cannot be read is refused by the rate limits, so a
missing or wrong setting shows as forms that always fail.

A Caddy site on the same machine (Caddy appends to `X-Forwarded-For` and gets the certificate itself):

```caddyfile
vault.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Do not publish port 3000 to the internet without a proxy: anyone could then send their own `X-Forwarded-For`.

## The GitHub App

One GitHub App serves both sign-in with GitHub and the git vault source (each account installs it on the one repository
that holds its vault). Create it under your account or organisation (Settings → Developer settings → GitHub Apps → New
GitHub App), with `https://vault.example.com` standing for your `APP_ORIGIN`:

| Field | Value |
| --- | --- |
| Callback URLs | `https://vault.example.com/api/auth/oidc/github/callback` and `https://vault.example.com/panel/source/github/callback` |
| Setup URL | `https://vault.example.com/panel/source/github/setup` |
| Webhook | Active, URL `https://vault.example.com/api/webhooks/github`, a secret of your choice (`openssl rand -hex 32`) |
| Repository permissions | Contents: Read-only, Metadata: Read-only. Nothing else. |
| Account permissions | Email addresses: Read-only (sign-in needs a verified email) |
| Subscribe to events | Push |
| Where can it be installed | Any account, or only yours for a private instance |

Then put its values into `.env`: the Client ID and a generated client secret into `GH_AUTH_CLIENT_ID` and
`GH_AUTH_CLIENT_SECRET`, the App ID into `GH_APP_ID`, its URL name (`github.com/apps/<name>`) into `GH_APP_SLUG`, a
generated private key into `GH_APP_PRIVATE_KEY` (the PEM on one line, newlines written as `\n`, in single quotes), and
the webhook secret into `GH_WEBHOOK_SECRET`. Without the webhook a vault is still checked every five minutes; with it,
a push syncs at once. Restart: `docker compose up -d --wait`.

## Search: by meaning or by words

Search works by words out of the box: every note is indexed for keyword search, and `search_vault` answers from it.
Search by meaning needs an embedding model behind an OpenAI-compatible `/embeddings` endpoint that answers vectors of
**1024 numbers**; `bge-m3` is the default model name and handles mixed-language notes. Set:

```dotenv
EMBEDDINGS_URL=http://ollama:11434/v1
EMBEDDINGS_MODEL=bge-m3
EMBEDDINGS_API_KEY=
```

The model can run next to the stack (for example Ollama with `bge-m3` pulled, added as a service to a
`docker-compose.override.yml` of your own) or be a hosted API; the key is sent as a bearer token when set. Changing
the model re-indexes every note. Without `EMBEDDINGS_URL` the meaning and hybrid modes answer by words and say so.

## Mail

Without `RESEND_API_KEY` no mail leaves the instance: password reset links and alerts by mail are not sent (sign-in
with GitHub still works). With a Resend key, set `MAIL_FROM` to a sender on a domain verified in Resend.

## Updating

```bash
git pull
SOFTURE_BUILD_COMMIT=$(git rev-parse HEAD) docker compose up -d --build --wait
```

The new image is built (`SOFTURE_BUILD_COMMIT` lets `GET /api/health/build` name the commit it runs), `migrate` applies the new migrations before the app and the worker restart, and the old
containers are replaced. Migrations only move forward: to go back to an older version, restore a backup taken before
the update. Read the release notes before a jump over several releases.

## Backups

Everything worth keeping is in two volumes: `postgres-data` (accounts, settings, the index) and `storage-data` (the
copies of notes, which the worker can always copy again from the sources). Back up the database regularly:

```bash
docker compose exec -T postgres pg_dump -U postgres -Fc vaultconnector > vaultconnector-$(date +%F).dump
```

Restore into a fresh stack: start only `postgres` (`docker compose up -d --wait postgres`), then
`docker compose exec -T postgres pg_restore -U postgres -d vaultconnector --clean --if-exists < vaultconnector-<date>.dump`,
then `docker compose up -d --wait`. Keep `.env` with the backup: without `VAULT_STORAGE_KEY_SECRET` and
`VAULT_SOURCE_KEYS` the stored copies and sealed bucket keys cannot be read.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `docker compose up` stops with `required variable … is missing a value` | Set that value in `.env`. |
| Every form answers "too many attempts" or is refused | The client address cannot be read: check `CLIENT_IP_SOURCE` and `TRUSTED_PROXY_HOPS` against your proxy. |
| `migrate` exits with an error | `docker compose logs migrate`. A database volume created with other passwords keeps them: use the old ones or `ALTER ROLE`. |
| The source screen says the git source is not configured | All five GitHub values must be set (`GH_AUTH_CLIENT_ID`, `GH_AUTH_CLIENT_SECRET`, `GH_APP_ID`, `GH_APP_SLUG`, `GH_APP_PRIVATE_KEY`). |
| Notes never appear | `docker compose logs worker`; the worker needs the note store (`storage-init` must have succeeded) and `VAULT_STORAGE_KEY_SECRET`. |
| An assistant cannot connect | It needs `APP_ORIGIN` on https with a valid certificate, reachable from the internet. |

## How this is tested

Every pull request that changes more than documentation builds this stack in CI (`.github/workflows/self-host.yml`), brings it up with
`docker compose up --wait` and runs the whole end-to-end suite against it, with a small override
(`docker/compose.e2e.yml`) that puts the app next to the suite's fake GitHub, S3 source and mail outbox.

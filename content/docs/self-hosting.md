---
title: Self-hosting
description: Run VaultConnector on your own server from one Docker Compose file, free under the AGPL-3.0.
order: 4
---

The hosted version is for convenience; the code is the same and free to run yourself under the AGPL-3.0. One Docker
Compose file starts everything: the app, its background worker, Postgres with pgvector and an S3-compatible store for
the copies of your notes.

## What you need

- A Linux machine with Docker and the Compose plugin, 2 GB of memory and a few GB of disk.
- A domain pointing at it and a reverse proxy serving it over HTTPS: assistants connect only to an `https` address.
- Optionally a GitHub App (sign-in with GitHub and the git source), a mail provider key, and an embedding model for
  search by meaning. Without a model, search works by words.

## Start

```bash
git clone https://github.com/jarmatys/VAULT_CONNECTOR.git vaultconnector
cd vaultconnector
cp .env.example .env
# fill in the required values: APP_ORIGIN, the database passwords, the note store's keys and secrets
docker compose up -d --build --wait
```

Open your domain and register the first account. A self-hosted instance has no plans and no payment: set
`PLAN_LIMITS=unlimited` and every limit is lifted.

## Updating

```bash
git pull
docker compose up -d --build --wait
```

Database migrations run by themselves before the app starts.

## The full guide

The step-by-step guide in the repository covers every setting, the reverse proxy and client addresses, the GitHub
App, search by meaning, mail, backups and troubleshooting: `docs/self-hosting.md` in the source code.

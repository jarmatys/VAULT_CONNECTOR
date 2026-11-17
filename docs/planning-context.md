# Planning context

Facts and decisions gathered outside this repository, without private data. Read this before research on any roadmap
item. Values that are secrets or addresses live in GitHub Environments and variables, never here.

## Product in one paragraph

An Obsidian user who pays for Claude (and later ChatGPT) asks their own notes from the phone app, with no computer left
running, no Docker on their side, and only the folders they picked, read-only. The market is global and
English-speaking. The model is open core in the Plausible style: the code is public under the AGPL-3.0 and free to
self-host; the hosted version is a paid subscription (hosting and convenience), and only the hosted version, one
public address, can be listed in the assistants' connector directories.

## Pains the product answers (from user complaints)

1. A local MCP server works only while the computer is on.
2. Setup is beyond a non-developer (config files, terminals, Docker).
3. Token cost and weak search: whole files land in the context.
4. People want to share only selected folders, read-only.
5. The assistant does not know it has the tool and has to be reminded.

## Competition and price anchors

A hosted-sync connector announced at about $1–2 a month; Obsidian Sync at $4–5; a notes service with its own AI at
about $12 (it needs a move away from Obsidian); an AI plugin tier at about $15. The planned hosted price is $5–6 a month
or $48–60 a year. The difference: two-minute setup on the existing vault, trust (open code, read-only, EU), and a
listing in the connector directory.

## Distribution

The Claude connector directory first (community listing, suggestions in chat, ranking by usage), then the ChatGPT
directory (no in-app sales; payment on the product's own site), GitHub, the Obsidian forum and the Obsidian subreddit.
No cold outreach.

Claude directory requirements known so far: remote HTTPS server, OAuth 2.0, a `title` and `readOnlyHint` on every
tool, a privacy policy, documentation, and a test account for the reviewer.

## Vault sources, in order

1. A git repository (read-only access to one repository, through an app installation rather than a personal token).
2. Obsidian's headless sync (note: the end-to-end encryption password).
3. Dropbox and S3-compatible storage.

## Gates

- **Gate 0:** landing page and waitlist on the product's own domain, privacy policy, funnel analytics.
- **Gate 1:** hosted MVP: many users, OAuth for claude.ai, git source, folder selection, hybrid index, read-only tools
  with annotations, server instructions, onboarding, self-host guide. Then the directory submission (owner step).
- **Gate 2:** payment and the first paying user.
- **Later:** headless sync, ChatGPT, Dropbox and S3.

## Hosting (owner, 2026-11-16 and 2026-11-17)

The hosted version runs **in the cloud, on Cloudflare, scaling with use**, not on a fixed VPS: close to zero cost at low
traffic, cost growing with paying users. Earlier VPS plans (2026-11-09) are superseded. Decided:

- The web app (landing, panel, OAuth, the MCP endpoint) on Cloudflare Workers through the OpenNext adapter, so the
  Next.js-based `@softure-ai/*` modules are kept (`platform: { host: "cloudflare" }`).
- **Postgres (Neon) in an EU region, reached through Hyperdrive, with pgvector** (owner, 2026-11-17). Not D1: every
  `@softure-ai/*` module speaks Postgres and D1 is SQLite (a second dialect would double every schema and query), D1
  has no vector type (search would need a second store), one D1 database is capped at 10 GB, and the self-hosted
  version would need a different database. Neon scales to zero when idle.
- Vault copies in R2 with the EU jurisdiction. Every user's data sits under its own prefix derived from a keyed hash of
  the account id, so storage paths cannot be read back to an account.
- The search index per user lives in Postgres: full-text for keywords and pgvector for meaning. The embedding model,
  the tokenizer and where embedding runs are settled by measurement in roadmap item VC-10.
- Background work (sync, indexing) runs as `@softure-ai/jobs` jobs driven by a Cron Trigger every minute, each tick
  with a 45-second budget, so a large vault is indexed in many small resumable jobs. Cloudflare Queues are added only
  if measurement (VC-8) shows the job table falling behind.
- Self-hosting stays: the same code on Node in Docker Compose with Postgres and pgvector (roadmap item VC-18).

Since the SOFTURE/AI runtime-providers roadmap (2026-11-16) every module this product uses runs on
`cloudflare+workers`, `@softure-ai/deploy` 0.7.1 has `init --host=cloudflare` and `@softure-ai/backup` 0.1.1 backs up
from a workflow (SOFTURE/AI `docs/07-runtime-providers.md`). A gap that remains (per-account connections for the vault
source, embeddings) is **fixed directly in SOFTURE/AI** by the item that meets it, kept generic; no issue is filed
(owner, 2026-11-16).

## Owner steps (outside the repository)

1. Buy the domain (planned: `vaultconnector.app`) on a dedicated Cloudflare account; set `APP_DOMAIN` and `APP_ORIGIN`.
2. Dedicated accounts: Cloudflare (Workers, R2, DNS, mail routing), the serverless Postgres provider, mail sending,
   a GitHub app for the git source and sign-in, observability.
3. GitHub: branch rules on `master` (pull request and green checks required), approval for workflows from forks, the
   `production` environment (its secret and variable names will be listed with the first deploy).
4. Anything paid waits for the owner's yes.

## Licences

All `@softure-ai/*` packages are MIT, compatible with the AGPL-3.0. Every new dependency is checked the same way.

# Contributing

Thanks for your interest. The project is at an early stage, so the best contribution right now is an issue: a bug, a
missing vault source, or a case where the assistant did not find the right note.

## Ground rules

- **Everything in the repository is English:** code, comments, tests, commit messages, docs.
- **No real vault data.** Tests and examples use fictional notes only. Never paste your own notes, tokens or server
  addresses into an issue, a pull request or a fixture.
- **Security issues go through private reporting**, see [SECURITY.md](SECURITY.md).

## Running it locally

Node 22.18 or later and a Postgres 16 with pgvector (the CI uses the `pgvector/pgvector:pg16` image). The database
address comes from `DATABASE_URL`; without it the app uses `postgresql://postgres:postgres@localhost:5432/vaultconnector`.

```bash
npm ci                    # dependencies and the git hooks
npm run migrate           # the SOFTURE modules' migrations
npm run dev               # http://localhost:3000, GET /api/health answers {"status":"ok"}

npm run typecheck && npm run lint && npm test   # the gates the hooks and CI run

npm run build && npm run e2e                    # the e2e suite on Node (`next start`)
npm run build:cloudflare && npm run e2e:workers # the same suite on Cloudflare's runtime (`wrangler dev`, no account)
```

Settings come from the environment only (`.env.example` lists them; copy it to `.env.local` for `npm run dev`):

| Variable | What it does | Without it |
| --- | --- | --- |
| `DATABASE_URL` | the Postgres the app uses | the local database above |
| `APP_ORIGIN` | the public address, for links in mail, robots.txt and the sitemap | `http://localhost:3000` |
| `SOURCE_CODE_URL` | the source code link (AGPL-3.0 section 13); point it at your fork | this repository |
| `MAIL_FROM` | the sender of every mail | a placeholder on `example.invalid` |
| `RESEND_API_KEY` | sends mail through Resend | the test provider: mail goes to `MAIL_OUTBOX` (a file) or `MAIL_OUTBOX_URL`, and is refused without either |
| `MAILING_UNSUBSCRIBE_SECRET` | signs the unsubscribe link of list mail (the waitlist's welcome) | list mail is refused; sign-ups still count |
| `GH_AUTH_CLIENT_ID`, `GH_AUTH_CLIENT_SECRET` | GitHub sign-in through a GitHub App of your own | the GitHub button is hidden; email sign-up still works |
| `RATE_LIMIT_SHARED_FALLBACK` | `1` shares one rate-limit key when no `cf-connecting-ip` arrives (no Cloudflare in front, e.g. `npm run dev`) | requests without a client address are refused by the sign-in forms |

`npm run funnel -- --days=7` prints the waitlist funnel per day (landing visits, sign-ups, registrations); it sets no
cookie and reads only daily counters.

The e2e suite needs none of these: it starts a fake GitHub and a mail outbox (`e2e/fake-services.mjs`) next to the app.

The app runs on two hosts from the same code: Node (self-hosted) and Cloudflare Workers through OpenNext, chosen by
`SOFTURE_HOST=cloudflare` at build time. `wrangler.jsonc` serves local development and the e2e suite only.

## Pull requests

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Work on a branch of your fork and open a pull request against `master`.
3. Add tests with the change: unit tests for logic, integration tests for what a user sees.
4. Keep the checks green. The git hooks (`npm install` sets them up) run the same gates locally.

Workflows started by pull requests from forks run without secrets and wait for a maintainer's approval.

## How the project is planned

Work is planned with a spec-driven workflow: product notes, requirements and a roadmap in `context/foundation/`, and one
folder per change in `context/changes/`. You do not need to follow it for a contribution; a maintainer links your pull
request to it.

## License

By contributing you agree that your contribution is licensed under the [AGPL-3.0](LICENSE), the licence of this
project.

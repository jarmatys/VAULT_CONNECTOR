# Plan: account-connects-git-source

## Approach
The app's own `vault` SOFTURE module owns the `vault` schema (`sources`, `source_link_states`). The source interface
(`src/vault/sources/source.ts`) is provider-neutral; the GitHub adapter implements it over the git data API with an
installation token from `@softure-ai/connections/github-app`. The link flow: panel button → GitHub's install page
(one-time state) → setup route (records the installation id on the state) → GitHub user authorization (PKCE) →
callback route (user token must reach the installation, exactly one repository, contents read-only) → source saved.
The source screen re-checks the installation on view and shows `disconnected` when it is gone or no longer reaches the
repository.

## Decisions (auto)
- One source per account (unique `user_id`); connecting again replaces it. A second source per account is not in the
  PRD.
- Exactly one repository: an installation reaching more than one, or `repository_selection = all`, is refused with a
  message to pick one repository on GitHub. Contents must be `read` (never `write`).
- Settings: `GH_APP_ID`, `GH_APP_SLUG`, `GH_APP_PRIVATE_KEY` plus the existing client id and secret. Without them the
  screen says the instance has no git source configured (self-hosted without GitHub).
- State: a random 32-byte value, only its sha256 stored, bound to the account, ten minutes, consumed once at the
  callback; the PKCE verifier lives on the row (it never reaches the browser).
- The user token is used for one call and dropped; nothing from GitHub but ids, names and the branch is stored.
- Source errors are a closed union: `source.disconnected`, `source.not_found`, `source.rate_limited` (retry after),
  `source.unavailable`, `source.too_large`, `source.unexpected`; `listChangesSince` answers `full_resync` instead of an
  error when GitHub cannot list the whole difference.
- Paths: only blobs (no submodules or symlinks); path text as GitHub gives it, NFC normalisation is VC-8's.
- The fake GitHub App joins `e2e/fake-services.mjs`; user tokens are resolved through auth's fake (`/user`).

## Phases
1. **Module, schema, source interface and GitHub adapter** (TDD on the adapter with an in-memory repository fetch):
   `src/vault/module.ts`, `src/vault/migrations/0001_create_sources.sql`, `src/vault/sources/source.ts`,
   `src/vault/sources/github/github-source.ts` (+ test), `src/vault/settings.ts` (+ test), `softure.config.ts`.
   Done when unit tests cover tree, read, changes (added, modified, removed, renamed, full resync), truncation and
   every error code, and `npm run migrate` applies the schema.
2. **Store and link flow** (test-after on PGlite): `src/vault/sources/store.ts`, `src/vault/sources/github/link.ts`
   (start, setup, complete, check), routes `api/vault/source/github/{setup,callback}`. Done when tests cover a forged
   installation id, an expired or replayed state, another account's state, more than one repository, write access,
   and revocation marking the source disconnected.
3. **Panel screen and e2e**: `/panel/source` (connect, connected with repository name, disconnected with reconnect,
   not configured, disconnect), panel home links to it, fake GitHub App in `e2e/fake-services.mjs`,
   `e2e/source.spec.ts` on both hosts. Done when e2e connects, names the repository and shows disconnected after the
   fake uninstalls.
4. **Docs**: `.env.example`, CONTRIBUTING table, owner steps (App id, slug, private key, setup URL, second callback
   URL), change.md `## Done`.

## Progress
- [x] Phase 1: module, schema, source interface, GitHub adapter; adapter and settings unit tests green (2f9d51c)
- [x] Phase 2: store and link flow, routes at `/panel/source/github/{setup,callback}`; PGlite tests green (2f9d51c)
- [x] Phase 3: `/panel/source`, panel home link, fake GitHub App, `e2e/source.spec.ts`; Node e2e 28 of 28 and the
  source spec 16 of 16 repeated runs locally, workerd in CI (2f9d51c)
- [x] Phase 4: `.env.example`, CONTRIBUTING table, owner step in change.md and the roadmap (2f9d51c)
- [x] Impl review: approved, three fixes (check throttle, e2e without browser routing, typed package failures)

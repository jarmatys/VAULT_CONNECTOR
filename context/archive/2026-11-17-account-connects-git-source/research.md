# Research: account-connects-git-source

## Today
- Accounts (VC-5): `@softure-ai/auth` with GitHub sign-in through a GitHub App's client id and secret
  (`GH_AUTH_CLIENT_ID`, `GH_AUTH_CLIENT_SECRET`, `src/account-settings.ts`); the e2e fake GitHub
  (`e2e/fake-services.mjs`) is auth's `createFakeGithubProvider`, reached through `GH_AUTH_FAKE_ORIGIN`
  (`src/auth/github-fetch.ts`, loopback only). The panel is `/panel` behind `requireUser` in
  `src/app/(panel)/layout.tsx`; the proxy guards the `/panel` prefix.
- No app tables yet: every table belongs to a SOFTURE module; `softure migrate` runs the modules' SQL in dependency
  order. A module defined in the app (`defineModule` with `resolveMigrationsDir`) runs the same way, with its schema
  (`dbSchema: "vault"`) and after `auth` (`dependsOn`), and `createTestDatabase` from `@softure-ai/testing` applies it
  too. Chosen over `drizzleAppMigrations`: one mechanism, one ledger, plain SQL like the modules.
- Module context for pages and routes: `src/auth/module-context.ts` (`getModuleContext`).

## Unknown 1: per-account GitHub App installations in `@softure-ai/connections`
- `connections` 0.4.x stores the app's own grants, admin only, one row per configured provider account. A user's
  installation needs no stored secret: the installation id is public and a token is minted from the App's key. Fixed
  in SOFTURE/AI as a stateless entry `@softure-ai/connections/github-app` (0.5.0): App JWT (WebCrypto, PKCS#1 or
  PKCS#8), installation details, narrowed installation tokens, repositories a token reaches, user code exchange,
  repositories of one installation a user token reaches; `createFakeGithubApp` in `/testing`.
- Security: the setup redirect's `installation_id` is a query parameter anyone can forge (GitHub's docs say so). The
  link is accepted only after the user's own token (user authorization of the same App, PKCE) reaches that
  installation. A one-time link state bound to the session account carries the flow across the two redirects.

## Unknown 2: reading a repository on Workers (128 MB isolate, request budget)
- Tarball (`/repos/{o}/{r}/tarball/{ref}`): one request, but the whole archive is decompressed and walked inside one
  invocation; a vault with attachments reaches hundreds of MB, past the isolate memory.
- Git data API: `GET /repos/{o}/{r}/commits/{branch}` (head sha and tree sha), `GET /git/trees/{tree}?recursive=1`
  (every path with blob sha and size, up to 100 000 entries / 7 MB, else `truncated`), `GET /git/blobs/{sha}` with
  `Accept: application/vnd.github.raw` (one file's bytes, up to 100 MB), `GET /compare/{base}...{head}` (changed files
  with status added, modified, removed, renamed; at most 300 files, `files` then incomplete).
- **Decision:** tree + blobs + compare. Each call is bounded, each file is read on its own (memory per file), and a
  sync can stop between calls and resume (VC-8 runs it in small jobs, one subrequest per file). A truncated tree and a
  compare at the 300-file cap answer `source.too_large` and `full_resync` respectively, so the caller never works from
  a partial list without knowing it.

## Revocation
- Webhooks need a public endpoint and a secret; not needed for "shows as disconnected". The panel checks on view:
  `getGithubAppInstallation` (404 or suspended) and an installation token's `listGithubInstallationRepositories`
  (the repository no longer selected). Either marks the source `disconnected`; VC-8's sync does the same on its calls.

## Files
- New: `src/vault/**` (module, migrations, settings, source interface, GitHub adapter, store, link flow),
  `src/app/(panel)/panel/source/**`, `src/app/api/vault/source/github/{setup,callback}/route.ts`, `e2e/source.spec.ts`.
- Changed: `softure.config.ts` (append the `vault()` module), `src/messages/en.ts` (source screen), the panel home's
  next step (link), `e2e/fake-services.mjs` (fake GitHub App), `package.json` (`@softure-ai/connections`), docs.

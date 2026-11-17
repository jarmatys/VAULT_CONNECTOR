# Research: two-minute onboarding (VC-12)

## What exists on master (2026-11-17)

- The panel's overview (`src/app/(panel)/panel/page.tsx`) shows up to four step cards: source, folders, "Connect
  Claude", status. A new account sees only the first (FR-5). Registration lands on `/panel` (`e2e/accounts.spec.ts`).
- The account's sentence about its vault: `src/mcp/profile/vault-description.ts` (300 characters, `connector.profiles`),
  saved on `/panel/connectors` (`saveVaultDescriptionAction`), sent in the server's instructions between the untrusted
  markers (`buildInstructions` in `src/mcp/server.ts`). FR-17 is implemented; VC-12 only has to guide to it.
- The connector URL is `${appOrigin}/api/mcp` (`getRequestOrigins` of mcp-access), shown in a `CodeBlock` without a
  copy action. mcp-access's `getTokenManagerProps` lists grants and tokens with `lastUsedAt` (set on first use, then at
  most once per stale window): the signal that an assistant reached the server.
- Status: `findLatestRun` (sync runs) and `getIndexProgress` (notes, indexed against the model, failure), rendered by
  `VaultStatus` on `/panel/status`.
- Jobs: saving picks enqueues `vault.sync` (`src/app/(panel)/panel/folders/actions.ts`) only when the note store is
  configured. A sync step that copied notes enqueues `vault.index`. Jobs run on the Cron Trigger (one tick a minute,
  `worker.ts`) or `scripts/worker.ts` on Node. `@softure-ai/jobs/workers` exports `runJobsTick({ queues, budgetMs,
  workerName })`, which claims due jobs of the named queues until the budget ends and runs them to their end.
- e2e: the suite has no note store and no job runner; the fake GitHub App serves a six-note fixture vault; the fake S3
  (`src/vault/testing/fake-s3.ts`) is read-only (list, get). `e2e/connector.spec.ts` drives OAuth (dynamic
  registration, consent page, PKCE token) and calls `/api/mcp` over HTTP.

## The unknown: which part of two minutes is the index, and what answers before it

- `vault_index` and `get_note` read the synced copies and the notes table; before the first sync finishes they answer
  `firstSync` ("being copied for the first time"). They do not need the index. `search_vault` needs the index
  (passages); `vault_status` answers at any time.
- So the first answer needs the first sync; a search needs the index. On Workers the sync step waits for the next Cron
  tick (up to 60 s) and the index step for the one after it (up to another 60 s): up to two minutes of waiting alone,
  the whole budget of G-2. Running the two queues once right after the picks are saved removes that wait: on the
  fixture vault both steps take well under a second each.
- `after()` from `next/server` runs after the response; on Workers the request's database scope stays open until the
  work registered with `after()` settles (`worker.ts`, `withRequestDatabase`), so the tick can use the request's handle.

## Kit

- `@softure-ai/theme-notion` 0.23.0 has `Steps` (numbered stages with `done`, `current`, `todo`, `failed`) and
  `CodeBlock`, `Status`, `MiniProgress`, but no copy action. A `CopyButton` is added to the kit (SOFTURE/AI, 0.24.0).

## Files this change touches

- `src/app/(panel)/panel/page.tsx`, a new onboarding action next to it, `src/onboarding/**` (step model, facts loader,
  client refresher), `src/messages/en.ts` (`panel`), `src/jobs/vault-kick.ts`, `src/app/(panel)/panel/folders/actions.ts`
  (one call), `DESIGN.md` (the onboarding pattern), `package.json` (theme 0.24.0).
- e2e: `src/vault/testing/fake-s3.ts` (writable mode), `e2e/fake-services.mjs` (a note store bucket),
  `e2e/services.ts`, both Playwright configs (store env), `e2e/onboarding.spec.ts`, an OAuth helper shared with
  `e2e/connector.spec.ts`.

## Risks

- Parallel items: VC-14 (plan limits) touches `src/mcp/**` and the panel; this change leaves `src/mcp/**` alone and only
  rewrites the overview's body. VC-21 adds a vault migration; this change adds none.
- A kick in a request could run a long sync on a large vault: the budget (20 s) bounds claiming, and a started step is
  itself bounded by the sync step's limits (it continues in a new job when it does not finish).

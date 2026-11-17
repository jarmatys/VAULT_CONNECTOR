# Plan: two-minute onboarding (VC-12)

## Approach

Turn the overview into a five-step guided flow computed from facts (a pure step model plus one loader), make the wait
short by running the vault's queues once after the picks are saved, and prove the two minutes with a timed e2e on
both hosts against a writable fake note store.

## Phases

### Phase 1: step model and facts (test-first)

- `src/onboarding/onboarding-steps.ts`: `getOnboardingSteps(facts)` → five steps (`source`, `folders`, `index`,
  `assistant`, `question`) with a state (`done`, `current`, `todo`, `failed`) and whether each step's action is open.
  Rules: source done with a source; folders done with a pick; index done when every copied note is indexed (or the
  first sync succeeded with no note), failed on a failed sync or an index failure; assistant done when a grant or a
  token was used; question open once folders are shared. The first step not done is `current`; index and assistant
  are both open after the picks, so Claude can be connected while the index runs.
- `src/onboarding/onboarding-steps.test.ts`: a new account, each step done in turn, a failed sync, an index failure,
  an empty vault, the assistant connected before the index ends.
- `src/onboarding/load-onboarding.ts`: reads the facts (source, picks, latest run, index progress, mcp-access grants
  and tokens) for one account; test with the vault test database.
- Done when: unit tests green, typecheck and lint clean.

### Phase 2: the guided overview

- `@softure-ai/theme-notion` 0.24.0 (`CopyButton`).
- `src/app/(panel)/panel/page.tsx`: header with "about two minutes", `Steps` (list layout) for the five states, then one
  card per open step: source and folders as today (test ids kept), the index with `Status` and `MiniProgress`, "Add to
  Claude" with the URL, a `CopyButton`, three numbered steps and the optional sentence form, the first question with a
  copyable prompt naming a shared folder. `src/onboarding/PanelRefresher.tsx` refreshes the page every 3 s while the
  index runs and when the tab becomes visible again.
- `src/app/(panel)/panel/actions.ts`: `saveOnboardingDescriptionAction` (session, own row, back to `/panel`).
- `src/messages/en.ts`: the copy; `DESIGN.md`: the onboarding pattern and the copy button.
- Done when: unit tests for the action's result path; screenshots at 1280 light and 390 dark looked at.

### Phase 3: the wait after the picks (test-first)

- `src/jobs/vault-kick.ts`: `runVaultJobsNow({ db, config, handlers, budgetMs })` runs one `runJobsTick` limited to
  `vault.sync` and `vault.index` under its own worker name; failures are logged, never thrown into the request.
- Test with the vault test database, a fake source and memory storage: after an enqueued sync, one call copies and
  indexes the notes.
- The folder save calls it with `after()` when the store is configured.
- Done when: test green; the e2e of phase 4 shows the index done without a job runner.

### Phase 4: timed e2e on both hosts

- `fake-s3.ts` writable mode (PUT, HEAD, DELETE) with tests; `fake-services.mjs` serves a note store bucket at
  `/store`; `services.ts` `STORAGE_TEST_ENV` passed by both configs.
- `e2e/assistant.ts`: the OAuth connection helper, used by `connector.spec.ts` and the new spec.
- `e2e/onboarding.spec.ts`: from sign-up with GitHub to the first answer through the guided panel (connect, pick, wait
  for the index step, copy the URL from the panel, the sentence, OAuth, `get_note` and `search_vault`), measured; at
  most 120 s, the duration as an annotation and a log line; the panel then shows "Add to Claude" done.
- Done when: `npm run e2e` and `npm run e2e:workers` green locally (or in CI) with the durations recorded here.

## Progress

- [x] Phase 1: step model and facts (unit tests: `npx vitest run src/onboarding`, 17 green)
- [x] Phase 2: the guided overview (Onboarding.test.tsx 6 green; screenshots in project files vault-connector/evidence/two-minute-onboarding/)
- [x] Phase 3: the wait after the picks (`npx vitest run src/jobs/vault-kick.test.ts`, 2 green)
- [x] Phase 4: timed e2e on both hosts (Node 6.6 s, 12 related specs green; workerd 9.6 s, 6 specs green)

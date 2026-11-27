# Plan: bump-softure-packages-2026-11-27

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| theme-notion | 0.35.0 → 0.41.1 | `RowActionsMenu` async confirm, `ResultBadge` props, `FoldRow`/`ListEntry` alignment and `sideLayout`, `HelpTooltip`, `DatePicker`/`DateTimePicker`, indeterminate `Checkbox`, `DialogContent size="form"`; the app renders none of these and has none of the overrides the migration lines name, so nothing changes |
| deploy (pins) | 0.7.9 → 0.7.10 | only `deploy-tested-tree.yml` changed, which the app does not call; "Migrate: nothing; move the `uses:` pin" |

## Phases

### Phase 1: versions and pins

- `package.json`, `package-lock.json`, `.github/workflows/{auto-release,backup,e2e,release}.yml`,
  `scripts/deploy/release-workflows.test.ts`, `context/workflow.json`, `docs/deployment.md`,
  `docs/planning-context.md`, this folder.
- Test: the existing pin guard `scripts/deploy/release-workflows.test.ts` holds every workflow pin and the CLI version
  to its constants, which move to `deploy@0.7.10`; no project code changes, so no new test.
- Done when: typecheck, lint and the unit suite are green locally, `npx softure-skills doctor` exits 0, and the pull
  request's checks are green.

## Progress

- [x] Phase 1: bump and pins. Locally: typecheck 0, lint 0, unit suite 68 files / 651 tests green (pin guard included), `npx softure-skills doctor` OK.

## Decisions (auto)

- The deploy pins move although the app calls nothing that changed in 0.7.10: every pin of one package moves together
  and stays on the newest release (routine step 4).

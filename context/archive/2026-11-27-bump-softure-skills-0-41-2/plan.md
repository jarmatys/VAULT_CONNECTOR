# Plan: bump-softure-skills-0-41-2

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.41.1 → 0.41.2 | `context_state.py` no longer adds a queued roadmap to `owner_queue`; regenerate `context/state.json` |

## Phases

### Phase 1: version, pin and state

- `package.json`, `package-lock.json`, `.claude/`, `.github/workflows/checks.yml`, `context/state.json`, this folder.
- Tests: the existing guard in `scripts/deploy/release-workflows.test.ts` holds the doctor pin to the installed skills
  version; no project code changes, so no new test.
- Done when: `npx softure-skills doctor` exits 0, typecheck, lint and the unit suite are green locally, and the pull
  request's checks are green.

## Progress

- [x] Phase 1: bump, pin, state. Doctor exit 0; `context_state.py check` up to date; typecheck, lint and unit suite 68 files / 651 tests
  green locally.

## Decisions (auto)

- `context/state.json` is left as the 0.41.2 script writes it, which is byte-identical: there is no queued roadmap.

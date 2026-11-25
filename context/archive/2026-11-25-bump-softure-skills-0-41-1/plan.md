# Plan: bump-softure-skills-0-41-1

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.37.0 → 0.41.1 | `owner-word` issues and the owner-word wake routine become `cockpit` issues and the COCKPIT command; `autonomy.ownerWordWake` is no longer read (removed); open `owner-word` issues are relabelled `cockpit` on the forge so the start-of-run check still finds them; the main branch's CI watch (`wt-main-ci.py`) arrives with the installer |

## Phases

### Phase 1: versions, pins and state

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/state.json`, `context/workflow.json`,
  `.github/workflows/checks.yml`, this folder.
- Tests: the existing guard in `scripts/deploy/release-workflows.test.ts` holds the doctor pin to the installed skills
  version; no project code changes, so no new test.
- Done when: `npx softure-skills doctor` exits 0, typecheck, lint and the unit suite are green locally, and the pull
  request's checks are green.

## Progress

- [x] Phase 1: bump, pins, state. Doctor exit 0; typecheck, lint and unit suite 68 files / 651 tests green locally.

## Decisions (auto)

- `autonomy.ownerWordWake` is removed rather than kept: no script in 0.41.1 reads it, and a stale key would claim a
  wake path that no longer exists.
- The obsolete owner-word wake scheduled task is left to the owner to delete (it is outside the repository).

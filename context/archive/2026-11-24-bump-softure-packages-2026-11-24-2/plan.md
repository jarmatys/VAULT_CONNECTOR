# Plan: bump-softure-packages-2026-11-24-2

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.34.0 → 0.36.0 | the installer rewrites `.claude/` and the managed block; the doctor checks `autonomy.ownerWordWake` (a note when an autonomous project leaves it out, a failure for an unknown value); `softure-skills state`, `doctor` exit 0; the doctor pin in `checks.yml` follows |
| jobs | 0.1.14 → 0.1.15 | "Run now" queues one follow-up run behind a running one; new exports `SCHEDULE_FOLLOW_UP_DEDUP_KEY`, `SCHEDULE_DEDUP_KEYS`; migrate: nothing (the app neither calls `runScheduleNow` nor reads `SCHEDULE_DEDUP_KEY`, grep over `src/`, `scripts/`, `integration/`) |

## Phases

### Phase 1: versions, pins and the owner-word wake declaration

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/state.json`, `context/workflow.json`,
  `.github/workflows/checks.yml`, this folder.
- Tests: the existing guard in `scripts/deploy/release-workflows.test.ts` holds the doctor pin to the installed skills
  version; no project code changes, so no new test.
- Done when: `npx softure-skills doctor` exits 0 with no note, typecheck, lint and the unit suite are green locally, and
  the pull request's checks are green.

## Progress

- [x] Phase 1: bump, pins, `ownerWordWake: "none"`. The doctor-pin guard fails until `checks.yml` moves to 0.36.0;
  doctor exit 0 with no note; typecheck 0, lint 0, unit suite 68 files / 651 tests green locally.

## Decisions (auto)

- `ownerWordWake: "none"`, not `"routine"`: the wake routine does not exist yet (the coordinator could not create a
  GitHub-triggered task); switch to `"routine"` once it does.
- The `owner-word` label exists already (GitHub API), so nothing is created.

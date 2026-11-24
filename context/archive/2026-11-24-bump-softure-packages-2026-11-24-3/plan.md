# Plan: bump-softure-packages-2026-11-24-3

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.36.0 → 0.36.1 | `ownerWordWake: "routine"` only once the wake routine and its GitHub trigger are verified (`"none"` until then); this project's routine claimed #55, so `"routine"` stays |
| skills | 0.36.1 → 0.37.0 | every owner answer (yes/no/later) settles the entry so it leaves the queue; `later` moves the item to `context/foundation/roadmaps/roadmap-later.md` under that roadmap's prefix and marks the old row `carried`; entries left `(later: #N)` get the doctor note `owner-entry-put-off`. Migrate: none here (no `later` answers exist: open owner-word issues #46, #47 carry no answer line, grep finds no `(later: #N)` in `context/`) |

## Phases

### Phase 1: versions, pins and state

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/state.json`, `.github/workflows/checks.yml`,
  this folder.
- Tests: the existing guard in `scripts/deploy/release-workflows.test.ts` holds the doctor pin to the installed skills
  version; no project code changes, so no new test.
- Done when: `npx softure-skills doctor` exits 0 with no note, typecheck, lint and the unit suite are green locally, and
  the pull request's checks are green.

## Progress

- [x] Phase 1: bump, pins, state. Doctor exit 0 with no note; typecheck 0, lint 0, unit suite 68 files / 651 tests green locally.

## Decisions (auto)

- `ownerWordWake` stays `"routine"`: the wake routine is live (it claimed #55 on 2026-11-24).
- No `roadmap-later.md` is created: nothing was answered `later`, and the file is created on first use (WORKFLOW §8.6).

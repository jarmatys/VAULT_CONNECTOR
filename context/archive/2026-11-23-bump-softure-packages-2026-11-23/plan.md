# Plan: bump-softure-packages-2026-11-23

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.24.0 → 0.30.0 | the installer rewrites `.claude/` and the managed `AGENTS.md` block; `softure-skills state` and `doctor` (exit 0); the doctor pin in `checks.yml` follows the installed version |
| auth | 0.2.19 → 0.2.21 | `softure migrate` applies migrations `0007` (`auth.invitations`) and `0008` (two indexes); invitations stay off (opt-in through `invitations.send`) |
| theme-notion | 0.29.1 → 0.30.0 | nothing (touch-sized `Switch` is opt-in) |

## Phases

### Phase 1: versions, installer output and pins

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/state.json`, `.github/workflows/checks.yml`,
  this folder.
- Done when: `npx softure-skills doctor` exits 0, typecheck, lint and the unit suite are green locally, and the pull
  request's checks are green.

## Progress

- [x] Phase 1: bump, installer output and the doctor pin (doctor exit 0; typecheck 0, lint 0, unit 68 files / 651 tests green)

## Decisions (auto)

- The auth invitations feature is not adopted: the product has no invitation flow, so only the migrations land.

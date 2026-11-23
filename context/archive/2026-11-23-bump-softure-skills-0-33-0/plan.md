# Plan: bump-softure-skills-0-33-0

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.30.0 → 0.33.0 | the installer rewrites `.claude/` and the managed `AGENTS.md` block; `softure-skills state` and `doctor` (exit 0, no `roadmap-item-shape` finding); the doctor pin in `checks.yml` follows the installed version |

## Phases

### Phase 1: version, installer output and the doctor pin

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/state.json`, `.github/workflows/checks.yml`,
  this folder.
- Done when: `npx softure-skills doctor` exits 0, typecheck, lint and the unit suite are green, and the pull request's
  checks are green.

## Progress

- [x] Phase 1: bump, installer output and the doctor pin (doctor exit 0; `release-workflows.test.ts` 17/17 green; typecheck, lint and the unit suite in the pull request's checks)

## Decisions (auto)

- The `context-doctor` job already runs on `pull_request` and on `push` to master with no paths filter, as the new
  `ci-doctor-trigger` rule asks; only its pin moves.

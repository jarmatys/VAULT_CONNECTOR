# Plan: skills-and-theme-latest

## Phases

### Phase 1: versions and the installer's output

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, this folder.
- Done when: typecheck, lint and the unit suite are green locally, and the pull request's checks are green.

## Progress

- [x] Phase 1: bump and installer output (see the commit; gates in the PR)

## Decisions (auto)

- The doctor's CI line waits for the follow-up change that sweeps `context/` to zero, as the installer says.

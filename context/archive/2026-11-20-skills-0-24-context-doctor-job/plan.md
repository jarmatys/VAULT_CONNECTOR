# Plan: skills-0-24-context-doctor-job

## Phases

### Phase 1: version, state and the CI job

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/workflow.json`, `context/state.json`,
  `.github/workflows/checks.yml`, `scripts/deploy/release-workflows.test.ts`, this folder.
- Done when: `npx softure-skills doctor` exits 0, typecheck, lint and the unit suite are green locally, and the pull
  request's checks, `context-doctor` among them, are green.

## Progress

- [x] Phase 1: bump, state, CI job and its guard (see the commit; gates in the PR)

## Decisions (auto)

- `project` is set to `VaultConnector` (the name the product calls itself), not the repository name.
- The doctor leaves the `static` job, so it runs once per pull request, in `context-doctor` only.

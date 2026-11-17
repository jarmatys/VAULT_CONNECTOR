# Plan: dependencies-to-latest

## Phases

### Phase 1: bump

- `npm install` the latest versions allowed by peers, `npm update` for the rest; move the `deploy@0.7.3` pins.
- Done when: typecheck, lint and unit tests pass locally and the pull request's checks (unit, e2e on Node and
  Workers, deploy dry run, secrets) are green.

## Progress

- [x] Phase 1: bump

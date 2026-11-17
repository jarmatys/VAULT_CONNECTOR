# Plan: worker-drops-import-meta-shim

## Phases

### Phase 1: bump and remove

- `npm install @softure-ai/core@^0.2.10`; delete `worker-runtime.ts` and its import in `worker.ts`.
- Done when: typecheck, lint and unit tests pass locally and the pull request's `e2e-workers` job (workerd) is green.

## Progress

- [x] Phase 1: bump and remove

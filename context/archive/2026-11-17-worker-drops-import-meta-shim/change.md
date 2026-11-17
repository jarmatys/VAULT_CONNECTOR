---
change_id: worker-drops-import-meta-shim
title: "Worker starts on @softure-ai/core 0.2.10 without its own import.meta.url shim"
status: archived
archived_at: 2026-11-17
roadmap_item: null
branch: claude/project-thread-lfwj4y
created: 2026-11-17
updated: 2026-11-17
---

## Intent

`worker-runtime.ts` (VC-8) assigned `import.meta.url` before the jobs config loaded, because workerd leaves it
undefined and the SOFTURE modules' `resolveMigrationsDir` threw. `@softure-ai/core` 0.2.10 (SOFTURE/AI#1345) handles
that on Workers itself, so the Worker goes back to the shape `softure-deploy init --host=cloudflare` generates.

## Scope

- `@softure-ai/core` to 0.2.10 in `package.json` and the lockfile.
- Remove `worker-runtime.ts` and its import in `worker.ts`.

## Notes

- Research and frame skipped: the cause and the fix were measured in workerd in SOFTURE/AI#1345.

## Decisions (auto)

- No new test here: the `e2e-workers` job serves this Worker in workerd on every pull request, and the package
  carries the unit and workerd tests.

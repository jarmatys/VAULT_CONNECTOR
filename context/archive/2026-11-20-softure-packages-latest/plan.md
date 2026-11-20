# Plan: softure-packages-latest

## Phases

### Phase 1: versions, pins and the migrate steps

- `package.json`, `package-lock.json`, `.github/workflows/*.yml`, `context/workflow.json`, `docs/`,
  `scripts/deploy/release-workflows.test.ts`, `next.config.ts`, `next.config.test.ts`, `e2e/assistant.ts`.
- Done when: typecheck, lint and the unit suite are green locally, and the pull request's checks (static, unit,
  e2e on Node and Workers) are green.

## Progress

- [x] Phase 1: bump, pins, backup-verify reporting, consent headers (see the commit; gates in the PR)

## Decisions (auto)

- No `eventTime` for the GitHub webhook: a push delivery carries no creation time of the event itself, and the
  signed-bytes replay key of security 0.2.12 already covers a resent delivery.
- No `guard-in-job` or `deploy-tested-tree` (deploy 0.7.4–0.7.6): they are inputs of the VPS reusable workflows; the
  Cloudflare release does not use them.
- The generated-by headers of the workflows keep the version that first wrote them; `backup-verify.yml` names 0.7.7
  for the reporting it took over.

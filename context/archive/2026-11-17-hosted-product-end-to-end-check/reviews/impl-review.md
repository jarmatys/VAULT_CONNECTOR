# Implementation review: hosted-product-end-to-end-check (VC-23)

Reviewed: 2026-11-18, against `plan.md` and `change.md`. Verdict: **approve**.

## Plan conformance

- Phase 1: `scripts/measure/measurements.ts` (the eleven measures and their PRD targets, records as JSON, the table
  renderer), `playwright-report.ts`, `record.ts`, `report.ts`; 10 unit tests in `npm test`.
- Phase 2: `assistant-harness.ts` connects through registration, consent and PKCE and calls the real MCP endpoint;
  `tool-speed`, `isolation`, `sync-delay` and `directory-checklist` measures (`npm run measure:tools`).
- Phase 3: `.github/workflows/measure.yml` (tools, onboarding on Node and Workers, the self-hosted compose stack, the
  report), on `ubuntu-latest`, no secrets, fakes only.
- Phase 4: the recorded run 44278551806 on `fed3eca`, 11 of 11 met; `docs/measurements.md`; the gaps in
  `context/backlog/measured-gaps.md`.

## Findings

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | Search answers echo the query, so a probe for another account's marker would read as a leak. | Fixed during Phase 2: the echoed query is removed before the leak check; the probes still search for every other account's markers, and the own-marker check proves the answers are not empty. |
| 2 | Suggestion | `compose-up` excludes the image build, so it is the wait of a self-hoster who pulls an image, not one who builds. | Accepted and named in the row's detail; the build time is in the job log. |
| 3 | Suggestion | The values come from fakes and PGlite, not the hosted instance. | Accepted: no hosted instance exists before the owner's release; the production re-run is a backlog line and an owner step. |

## Evidence

- `npm test -- scripts/measure` green (10 tests); `npm run typecheck`, `npm run lint` green at `fed3eca`.
- Local `npm run measure:tools`: 4 files, 7 tests passed.
- Sabotage: dropping a checklist row's evidence file makes `checklist-points` 6 and the test fails.
- PR #28 checks all green at `fed3eca`, including the `measure` run
  https://github.com/jarmatys/VAULT_CONNECTOR/actions/runs/44278551806 (Met: 11 of 11).

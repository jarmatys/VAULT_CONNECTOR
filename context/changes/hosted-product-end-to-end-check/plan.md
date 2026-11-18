# Plan: The hosted product is checked end to end (VC-23)

## Approach
One measurement run, `.github/workflows/measure.yml` (on demand and on pull requests that change `scripts/measure/**`),
whose jobs each write measurements as JSON and whose last job renders one table against the PRD targets:
- tool measurements on PGlite through the real MCP endpoint (`npm run measure:tools`, files `scripts/measure/*.measure.ts`):
  NFR-1 p95 of the three tools on 5,000 synced and indexed notes, NFR-2 isolation on twelve accounts, NFR-5 delay of a
  source change on the simulated minute tick (with and without a push), G-3 the checklist counted and its points checked
  on the live server;
- G-2 from the timed onboarding e2e on Node and on workerd (Playwright JSON report);
- G-5 from the compose stack: time to a healthy stack, then the timed onboarding on it.
`scripts/measure/report.ts` turns the JSON files into the markdown table (job summary and artifact); the recorded run's
table goes into `docs/measurements.md`. Gaps become lines in `context/backlog/measured-gaps.md`.

## Decisions (auto)
- Measurements are not part of `npm test` (`*.measure.ts`, own vitest config): the 5,000-note sync takes minutes.
  The renderer and parsers have unit tests in `npm test`.
- Tools are measured through the endpoint (OAuth token, JSON-RPC), not the functions, so the number is what an
  assistant sees minus the network.
- Sync delay: worst case = a change right after a scheduled check; the clock moves a minute per tick as the Cron Trigger
  does; real time of each tick's work is added.
- No production run: deploying is the owner's step; the table says where each value was measured.

## Phases
1. Measurement records, targets and the report renderer with unit tests; Playwright report parser.
2. Tool measurements: assistant harness, NFR-1, NFR-2, NFR-5, G-3.
3. Workflow `measure.yml`; scripts in `package.json`.
4. Recorded run: values into `docs/measurements.md`, gaps into the backlog; close the change.

## Progress
- [ ] Phase 1: records, targets, renderer, parser
- [ ] Phase 2: tool measurements
- [ ] Phase 3: workflow
- [ ] Phase 4: recorded run, docs, backlog, archive

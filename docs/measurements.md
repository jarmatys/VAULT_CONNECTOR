# Measured goals

The PRD's measurable goals, measured in one run of `.github/workflows/measure.yml` (VC-23). The workflow runs on
demand ("Run workflow") and on pull requests that change `scripts/measure/**`; every run writes the same table into
its summary and the `measurements` artifact. This page keeps the recorded run.

- Run: https://github.com/jarmatys/VAULT_CONNECTOR/actions/runs/44278551806
- Commit: `fed3eca`, 2026-11-18
- Data: fictional vaults only, fake GitHub and fake model; no paid service was called.

| Goal | Measure | Target | Measured | Where | Result |
| --- | --- | --- | --- | --- | --- |
| G-2 | Sign-up to first answer, Node | ≤ 120.0 s | 6.6 s | Node (next start), Postgres 16 with pgvector, fake GitHub and model, GitHub runner | met |
| G-2 | Sign-up to first answer, Workers (workerd) | ≤ 120.0 s | 6.6 s | workerd (wrangler dev), Postgres 16 with pgvector, fake GitHub and model, GitHub runner | met |
| G-3 | Checklist points met, with evidence | ≥ 7 | 7 | MCP endpoint and OAuth documents on PGlite, reviewer fixture vault | met |
| G-5 | `docker compose up` to a healthy stack | ≤ 300.0 s | 25.9 s | `docker compose up --wait` (Postgres with pgvector, SeaweedFS, migration, app, worker), image built beforehand | met |
| G-5 | Sign-up to first answer on the compose stack | ≤ 120.0 s | 6.3 s | the compose stack's app container, fake GitHub and model | met |
| NFR-1 | `search_vault` p95 | ≤ 3.0 s | 135 ms | MCP endpoint on PGlite, fake model; 40 calls on 5,000 notes, median 120 ms | met |
| NFR-1 | `vault_index` p95 | ≤ 1.0 s | 67 ms | as above, median 61 ms | met |
| NFR-1 | `get_note` p95 | ≤ 1.0 s | 54 ms | as above, median 50 ms | met |
| NFR-2 | Answers with another account's or an unpicked folder's text | 0 | 0 | MCP endpoint on PGlite; 12 accounts, 360 tool calls | met |
| NFR-5 | Change visible to the tools, no push (worst case) | ≤ 10.0 min | 5.0 min | jobs on a simulated one-minute tick; five-minute check, change right after the previous one | met |
| NFR-5 | Change visible to the tools after a push | ≤ 10.0 min | 1.0 min | as above; a GitHub push enqueues a sync at once | met |

Met: 11 of 11.

## What the numbers mean

- **Upper bound for the database work, lower bound for the network.** The tool timings run the real MCP endpoint
  with OAuth bearer tokens, but on PGlite in the test process and without the network; a real embedding model adds its
  own call to each search. The onboarding timings drive the real panel in a browser against Postgres with pgvector.
- **Fakes, not production.** No hosted instance exists yet (the owner's steps in the roadmap). The same goals are
  measured again on the hosted instance after the first release; that run and anything a fake cannot show (a real
  Claude client, a real embedding model, a real GitHub push) are lines in `context/backlog/measured-gaps.md`.

## How to run it

- `npm run measure:tools`: NFR-1, NFR-2, NFR-5 and G-3 locally (PGlite, about a minute); records land in
  `measure-results/`.
- `npm run measure:report -- measure-results`: the table from the records in a folder; exits 1 when a target is
  missed or a measure has no record.
- The onboarding and self-host rows need Postgres with pgvector and Docker: run the workflow.

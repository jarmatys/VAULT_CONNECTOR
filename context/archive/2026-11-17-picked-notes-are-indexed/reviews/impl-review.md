---
change_id: picked-notes-are-indexed
verdict: approved
---

# Implementation review

- Drift from plan: none in scope. Two additions: `describePassage` leaves the note title out when the heading path
  already starts with it (otherwise every keyword text began with the title twice), and the Workers AI binding is
  registered per isolate by both the `fetch` and the `scheduled` handler (`registerWorkersAiBinding`), so an index job
  started from a request (a saved pick) also has it.
- Isolation: every query of the store and the search names `user_id`; tests show another account's passages untouched
  by an index step and never returned by a search; unpicked notes have no copy, so no passages.
- Correctness: the passage write locks the note row and checks the version in one transaction, so a step that read an
  older copy writes nothing (tested); a model change re-embeds through the five-minute check (tested); an embedding
  failure keeps the old passages, records the code for the panel, retries in five minutes and clears on success
  (tested); vectors of another length than the column fail as `llm.invalid_output` before any write (tested); a
  95-note vault indexes in steps of at most 20 notes (tested).
- Search quality: keyword-only top-5 hit rate 100% on the same-language queries of the EN/PL/DE fixture, and at least
  90% hybrid with the fake embedder (cross-language queries need a real model). A real-model run is an owner step
  (`npm run index:hit-rate`, `docs/deployment.md` Owner steps 7): this container reaches no model host.
- Language gate: Polish fixture text lives under `src/vault/testing/pl/`; folding uses `\u` escapes for the letters
  NFKD leaves alone.
- Privacy: the policy names Workers AI, says computing may run outside the EU and that only the results are stored
  (in the EU); a new history entry moves the consent version to 2026-11-18.
- Gates: typecheck, lint, unit tests and the Node e2e green locally against Postgres 16 with pgvector; the workerd e2e
  runs in CI.

Verdict: approved.

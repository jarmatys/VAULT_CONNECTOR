# Research: context-doctor-to-zero

| Step | Result |
| --- | --- |
| `doctor` before | 1 failure: `archived-roadmap-open-checks` in `context/foundation/archive/2026-11-18-roadmap.md` (VC-15 prices, VC-17 directory submission); note `state-missing` |
| `doctor --fix --write` | 0 edits |
| `doctor --sweep` | 2 entries, both with evidence of an archived change, 0 superseded |

Both entries name work whose code is done (`2026-11-17-account-pays-for-plan`, `2026-11-17-docs-and-reviewer-account`)
but whose remaining step is the owner's: the real prices (PRD OQ-2; `src/lib/plans.ts` still holds placeholders) and
the submission to the directory with the owner's account after the first release. Neither is done nor superseded, and
there is no live roadmap, so each goes to an `owner-word` issue (WORKFLOW §8.6).

`checks.yml` triggers on every `pull_request` without `paths-ignore`, so no extra job is needed for `context/`-only
changes.

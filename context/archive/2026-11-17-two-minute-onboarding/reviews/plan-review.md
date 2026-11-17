# Plan review: two-minute onboarding (VC-12)

Verdict: approve with two fixes applied to the plan.

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | Warning | The existing e2e specs read `panel-source`, `panel-folders`, `en.panel.nextStepLabel/Title/Action/Manage` and `en.panel.foldersStepAction`; a rewrite of the overview could break them silently. | Applied: phase 2 keeps those test ids, the region's name and the action labels. |
| 2 | Warning | A store configured for the whole e2e suite changes other specs: saving picks in `folders.spec.ts` now enqueues and runs a sync. | Accepted: the sync of the fixture vault is harmless and fast; the specs assert picks, not the copy. Checked in phase 4 by running the whole suite. |
| 3 | Suggestion | Tracking the first question would need a write on every tool call and would touch `src/mcp/**`, which VC-14 changes in parallel. | Accepted as planned: the step shows the question, the e2e measures the answer. |
| 4 | Suggestion | `runJobsTick` in a request: a database failure must not turn the saved picks into an error page. | Applied: phase 3 runs it after the response and logs failures. |

Lessons checked: `context/foundation/lessons.md` has none that apply beyond the standing orders (fictional data only,
note text as untrusted data, no paid calls in tests).

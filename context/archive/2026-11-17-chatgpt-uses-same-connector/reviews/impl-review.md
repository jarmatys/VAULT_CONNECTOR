# Implementation review: chatgpt-uses-same-connector (VC-19)

Verdict: approve. Reviewed the diff against `plan.md`, `change.md` and ChatGPT's published rules.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Suggestion | The ended-access pointer is the site's home page; a dedicated public plans page would describe the plans better. | No change now: the landing page is informational and allowed; a plans page is product copy for lane A if the owner wants one. |
| 2 | Suggestion | No CIMD support in `@softure-ai/mcp-access`; ChatGPT prefers it. | No change: ChatGPT falls back to DCR, which works and is tested. CIMD is a generic package feature for later, not needed for FR-25. |
| 3 | Warning | The guard's word list could flag a future harmless text (e.g. "pay attention"). | Accepted as is: a hit is cheap to reword, and a false negative would break the directory rule. |

Checks:
- Drift from plan: none. Phases 1 to 3 done as planned; the copy guard walks every string under `en.mcp`.
- Tests seen red first: the `securitySchemes` expectation (two ChatGPT tests) and the copy guard (three cases)
  failed before the code change and pass after.
- Security: no new route, no new secret, tools stay read-only; the redirect allowlist is unchanged (`https` anywhere).
- Migrations, dependencies: none.

## CI follow-up
- The self-host workflow's billing e2e failed on this PR and on master (run of 4385a9e): the compose e2e stack
  enforces plans but got no Stripe values, so Checkout could not reach the fake Stripe (VC-15 and VC-18 met on
  master). Fixed here: `docker/compose.e2e.yml` passes `STRIPE_API_BASE`, `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`, the e2e env builder sets them from the fake services, with a test in
  `scripts/self-host/compose.test.ts` seen red first.

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

# Plan review: visitor-joins-waitlist (VC-2)

Reviewed against change.md, research.md, the PRD (FR-1, FR-3, G-1) and the reference app. Auto mode: findings decided
with the recommended fix.

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | Warning | FR-1 asks that a repeat address "says it is already on the list"; the module answers alike to avoid revealing who signed up. | Accept the module's rule; the copy "You're on the list" holds for both, the e2e asserts the same answer and one row. Recorded in research. |
| 2 | Warning | The roadmap names agent discovery files; agent-ready cannot build them without an MCP server. | Deferred to VC-17 (owns the agent-ready entry); robots and sitemap ship now. Reported to the coordinator. |
| 3 | Warning | Rate limits key on `CF-Connecting-IP`; without it every e2e client shares one bucket and parallel tests trip `waitlist`. | e2e sends `clientAddressHeaders()` per test, as the reference does. |
| 4 | Suggestion | FR-3 "each step shows a daily count": the report is a window total. | Per-day rows from consecutive windows, unit-tested. |
| 5 | Suggestion | Workers e2e cannot read a file the Worker wrote. | Outbox sink process for the workerd config. |

Verdict: ready to implement.

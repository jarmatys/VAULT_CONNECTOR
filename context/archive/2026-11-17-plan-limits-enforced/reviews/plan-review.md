# Plan review: plan-limits-enforced

Reviewed 2026-11-17 against change.md, research.md, PRD FR-18 and the code on master.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | Billing's trial ends after 14 days; without a payment path (VC-15) every hosted account would lose search afterwards. Nothing is deployed before VC-15, and read-only keeps the notes, so the risk is bounded. | Accepted; VC-15 owns trial and payment, noted in change.md. |
| 2 | Warning | A transaction held across the search embeds the query while it holds the account's usage row. Only that account's searches wait; the search uses the same handle. | Accepted, documented in search-allowance.ts. |
| 3 | Suggestion | The over-limit count would go stale when a run plans nothing; plan opens a zero-item run when it changed. | Applied (Decisions). |
| 4 | Warning | Self-hosted instances must not be held by hosted plans. | Applied: `PLAN_LIMITS=unlimited`; VC-18 sets it in compose. |
| 5 | Suggestion | Lane B owns vault migrations; this item adds one column. | Accepted: additive column, renumber on conflict. |

Verdict: ready to implement.

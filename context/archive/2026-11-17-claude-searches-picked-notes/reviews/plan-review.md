# Plan review: claude-searches-picked-notes

Verdict: proceed with the fixes below applied to plan.md.

| # | Finding | Severity | Decision |
| --- | --- | --- | --- |
| 1 | The picks filter must run in SQL, not after `LIMIT`, or a folder with many unpicked hits returns too few passages. | Critical | Accepted: phase 1 puts the scope in every ranking query. |
| 2 | A search refused for an empty vault must not use the allowance. | Warning | Accepted: `explainEmpty` runs before the reservation. |
| 3 | The reservation must be released if the ranking throws, or a failing database eats the allowance for an hour (TTL). | Warning | Accepted: phase 2 releases on failure. |
| 4 | Metering's charges carry `account_id`; VC-16 (export and delete, in flight) must include them. | Warning | Accepted: handed to the coordinator for VC-16; charges hold no note text. |
| 5 | Global provider lock per reservation serialises all searches. | Suggestion | Recorded as a follow-up in research; not a blocker at launch volume. |
| 6 | A folder given with a trailing slash or a leading slash should resolve. | Suggestion | Accepted: trimmed before matching. |

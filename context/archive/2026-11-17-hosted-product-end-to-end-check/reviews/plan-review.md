# Plan review: The hosted product is checked end to end (VC-23)

Verdict: approve with the changes below (applied to plan.md).

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The trial plan caps an account at 5,000 notes and 1,000 searches a month; the speed vault must stay at the cap and the run must not exhaust the allowance. | Accepted: exactly 5,000 notes, 40 calls per tool. |
| 2 | Warning | A measurement that only records numbers would let a regression through quietly. | Accepted: each measurement test also fails when its target is missed, and the report marks it. |
| 3 | Suggestion | A run on a pull request would re-run when the recorded doc is committed. | Accepted: the workflow's paths leave `docs/measurements.md` out. |
| 4 | Suggestion | Isolation on many accounts should also cover unpicked folders of each account, not only other accounts. | Accepted: every account has a shared and an unshared marker. |

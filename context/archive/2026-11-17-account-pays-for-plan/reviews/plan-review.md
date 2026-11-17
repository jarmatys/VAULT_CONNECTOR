# Plan review: account-pays-for-plan

Reviewed against change.md, research.md, the PRD (FR-19) and the code on master (2a45f38).

| # | Finding | Severity | Decision |
| --- | --- | --- | --- |
| 1 | Self-hosted instances would turn read-only after billing's 14-day trial and lose their tools. | Critical | Accepted: gate and purge only when `isPlanLimited`; plan already says so, test added to phase 2 and 3. |
| 2 | A purge through the sync needs a reachable source; a disconnected source would keep copies forever. | Warning | Accepted: the purge deletes rows and queues objects itself (phase 3). |
| 3 | After the purge, the five-minute sync check could copy the notes back on its next run. | Warning | Accepted: lapsed accounts get caps of 0 (phase 3 done-when covers it). |
| 4 | The webhook must stay outside the auth guard. | Suggestion | Checked: the proxy protects only `/panel` and `/admin`. |
| 5 | A payment page with no adapter throws (billing). | Warning | Accepted: the page answers not-found when no provider is configured (self-hosted). |

Verdict: ready to implement.

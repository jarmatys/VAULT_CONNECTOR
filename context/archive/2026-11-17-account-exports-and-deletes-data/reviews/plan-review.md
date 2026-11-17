# Plan review: account-exports-and-deletes-data

Verdict: approved with two fixes applied to plan.md.

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | Critical | Deleting objects inside the privacy transaction cannot be rolled back; a later contributor's refusal would leave rows without copies. | Accepted: objects go through a job after the commit (plan Approach). |
| 2 | Warning | A sync step in flight can put an object after the keys are taken. | Accepted: keys include planned items; the job is due past the 120 s lease. |
| 3 | Warning | GitHub-only accounts have no known password, and the package's form asks for one. | Accepted as a documented path (reset link) plus a follow-up for the package; not in scope. |
| 4 | Suggestion | The export must not carry the sealed S3 key pair or the PKCE verifier. | Accepted: the export test asserts their absence. |
| 5 | Suggestion | The test must prove the token refusal through the endpoint, not only the missing row. | Accepted: phase 1 calls `/api/mcp` with the old token. |

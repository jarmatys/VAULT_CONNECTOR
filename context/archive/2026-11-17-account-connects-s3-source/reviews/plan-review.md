# Plan review: account-connects-s3-source

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The endpoint is fetched server-side: SSRF to internal hosts. | Accepted: https only, private/loopback/link-local IP literals and `localhost` refused, opt-in flag for self-host and tests (Phase 1 tests). |
| 2 | Warning | `saveGithubSource` keeps picks when the previous row is S3 (`NULL <> id` is not true). | Accepted: compare `kind` too; test switching both ways (Phase 2). |
| 3 | Warning | A sealed key pair copied to another account's row must not open. | Accepted: additional data `vault/sources/<user id>/s3`; test (Phase 2). |
| 4 | Suggestion | Listing twice per step (getCursor, then listTree). | Accepted: the adapter caches its listing for its own lifetime (one step). |
| 5 | Suggestion | Migration number may collide with VC-10. | Noted in research; renumber at merge if needed. |

Verdict: approve with the fixes folded into the plan.

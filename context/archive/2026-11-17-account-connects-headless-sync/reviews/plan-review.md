# Plan review: account-connects-headless-sync

Reviewed against change.md, research.md, the source interface and the Dropbox and S3 adapters.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The secret is the riskiest part (roadmap "Risk"): the plan must name a test that the password never reaches the server. | Accepted: phase 3's e2e records every request body and asserts the typed password appears in none; phase 2 asserts token and key are absent from the export and from errors. |
| 2 | Warning | A host taken from the service's answer could point the server at any address (SSRF). | Accepted: host allow-list (service subdomain, loopback only with the fake origin), tested in phase 1. |
| 3 | Warning | Interoperability with the live service cannot be proved in CI. | Accepted as a residual risk: RFC vector plus spec; an `Owner step:` line for a live probe before the release. |
| 4 | Suggestion | Listing from version 0 on every five-minute check costs one full metadata stream. | Kept for simplicity (same model as Dropbox); an incremental `listChangesSince` from the stored version is a later optimisation. |
| 5 | Suggestion | Migration number may collide with parallel items. | Rule of the run: whoever merges second renumbers. |

Verdict: ready to implement.

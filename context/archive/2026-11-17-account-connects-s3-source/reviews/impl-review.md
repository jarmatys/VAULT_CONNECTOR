# Implementation review: account-connects-s3-source

Reviewed against `plan.md` on the branch after phase 3 (bd13111) and a merge of master (dcdf3fa).

## Verdict
Approve. The plan's three phases are implemented as written and every done-when criterion has a test or an e2e run
behind it (see `## Progress`).

## Findings

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Suggestion | The source contract lives in `src/vault/testing/source-contract.ts`, not `src/vault/sources/` as the plan named it. It is a test helper, so the testing folder fits better. | Accepted as built; plan drift recorded here. |
| 2 | Warning | SSRF: the endpoint check refuses literal private addresses and private-looking names, but a public name that resolves to a private address is only stopped by the host (Workers cannot reach private networks; a self-hosted Node instance can). Requests never follow redirects (`requestBytes` uses `redirect: "manual"` and refuses 3xx). | Accepted: the hosted product runs on Workers; self-hosting is the operator's own network. Documented with `VAULT_S3_ALLOW_PRIVATE_ENDPOINTS` in `.env.example`. |
| 3 | Suggestion | The panel's next-step action and the source page's GitHub card both read "Connect your vault" at first, which made a strict e2e locator ambiguous. | Fixed: the action reads "Choose a source". |
| 4 | Suggestion | Migration `0004_add_s3_sources.sql` may share its number with VC-10's vault migration (same lane). | Renumber at merge if VC-10 lands first. |

## Security
- The key pair is sealed with AES-256-GCM bound to `vault/sources/<user id>/s3`, never logged, never sent back to the
  browser (the e2e test checks the page does not contain the secret).
- Connecting is rate limited per account (`vault-s3-connect`, 10 per 15 minutes) and checks the session.
- Note text read from the bucket goes through the same sync and the same untrusted-data marking as git.

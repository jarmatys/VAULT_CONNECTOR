# Implementation review: account-connects-headless-sync

Verdict: approve after one fix. All three plan phases are done and verified; no drift from the plan.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The panel actions dropped the held sign-in cookie with `cookies().delete(name)`, which clears path `/`, while the cookie lives on `/panel/source/headless-sync`; the browser kept it for up to ten minutes, and "back" on the form within that time would have signed out the session the connected source now uses. | Fixed: one `clearPendingCookie` deletes with the cookie's own path; the E2EE e2e test asserts no `vc_sync_pending` cookie after connecting. |
| 2 | Suggestion | The sync protocol and key derivation follow the official client's published behaviour and the RFC 5297 vector, but were not run against the real service (no paid subscription in tests, by the standing order). | Accepted: a live probe with a real subscription is an owner step before the release that enables the source. |
| 3 | Suggestion | Outbound WebSockets from a Worker are exercised only by the "e2e on Workers" CI job. | Accepted: the CI job is the evidence; `binaryType` is set best effort for Workers. |

Secret handling (OQ-1): the account password and an end-to-end vault's encryption password are never stored; the E2EE
password never reaches the server (the browser derives the key, the input has no `name`, the e2e test asserts the
password is in no request). What is kept is the service session token and the vault key, sealed together per account
under `VAULT_SOURCE_KEYS` (envelope encryption, context bound to the account), opened only in memory for one sync job,
never logged, never exported, deleted on disconnect and account deletion. The privacy policy says so.

Checks: fictional vaults, emails and passwords only; no domain, address, account id or secret in the diff; the socket
dials only `*.obsidian.md` (loopback only with the e2e fake); English everywhere (language gate green); typecheck,
lint and unit tests green.

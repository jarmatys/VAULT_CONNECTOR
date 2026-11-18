# Plan review: sources-use-user-oauth

Verdict: proceed.

- Warning: the refresh failure mapping must keep `invalid_grant`, `invalid_client` and `unauthorized_client` as
  disconnected and a 429 as rate limited. Covered by the existing revoked-grant test and a new token-endpoint test.

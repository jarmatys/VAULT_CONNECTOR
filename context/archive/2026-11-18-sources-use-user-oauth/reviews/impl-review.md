# Implementation review: sources-use-user-oauth

Verdict: approve.

- The state hash stays lowercase hex (the `vault.source_link_states` constraint); the link tests pass unchanged.
- A grant with a write scope is still refused and revoked (now with the app's credentials passed to the package; the
  bearer revocation sends only the access token).
- No local OAuth helper is left (`createRandomToken`, `hashToken`, `createChallenge`, `toBase64Url` gone from
  `src/vault/sources`).

# Plan: account-connects-headless-sync

## Approach
A fourth adapter of the vault source interface over the sync service's own protocol (account API plus one WebSocket),
written from the published protocol description, with no dependency on the unlicensed official client. The account
signs in to its sync account on `/panel/source/headless-sync` (email, password, optional 2FA code), then picks one of
its remote vaults. A vault with standard encryption connects at once; an end-to-end vault asks for its encryption
password, from which the browser derives the key. The server checks the key against the service, seals the session
token and the key with the vault keyring bound to the account and stores the source. The adapter opens one socket per
lifetime (one sync step), lists every record since version 0, decrypts the paths, uses a hash of the listing as the
cursor (like Dropbox) and pulls a file by its record id.

## Decisions (auto)
- Kind `headless-sync`; columns `headless_vault_id`, `headless_vault_name`, `headless_host`, `headless_salt`,
  `headless_encryption` (`standard`|`e2ee`), `headless_encryption_version` (0, 2, 3) and `headless_credentials`
  (sealed JSON `{token, key}`), migration `0008_add_headless_sync_sources.sql`.
- The encryption password is never stored, never sent: E2EE keys are derived in the browser (`@noble/hashes` scrypt);
  the password input has no `name`. Standard vaults: the key is derived on the server from the managed password the
  list returns, then only the key is kept (sealed). Owner rule OQ-1: envelope encryption under `VAULT_SOURCE_KEYS`,
  opened in memory for one step, deleted on disconnect and with the account.
- Pending sign-in between the two steps: a sealed, httpOnly, `SameSite=Lax`, path-scoped cookie (ten minutes) holding
  the token, bound to the account; no table. Disconnect and "start again" sign the token out best effort.
- Socket host must be a subdomain of the service's domain (or loopback when the e2e fake origin is set): the host comes
  from the service's answer and is never a person's input. API origin fixed; `HEADLESS_SYNC_FAKE_ORIGIN` (loopback
  only) points both at the e2e fake.
- Version = the record's `uid`; size = encrypted size minus 28 (IV and tag); folders and deleted records are skipped;
  a read checks the uid against this lifetime's listing and answers `source.not_found` for a stale one.
- Status mapping: sign-in or `init` refused (token or key) → disconnected; socket error, close or timeout →
  unavailable; HTTP 429 → rate limited; an answer that does not parse or decrypt → unexpected.
- Caps: 50 000 files, 25 MB per file, as for the other sources.
- Rate limit `vault-headless-sync-connect` (10 per 15 minutes per account) on sign-in and on the vault pick.
- UI: plain server forms with the theme's `Field`/`Card` parts plus one small client form for the E2EE password; no
  new generic component, so nothing goes to the kit.
- Privacy policy names the sync service as a source processor and states the key handling plainly.

## Phases
1. **Crypto and protocol** (TDD): `sync-crypto.ts` (scrypt, key hash, AES-GCM, AES-SIV over Web Crypto; RFC 5297
   vector), `sync-api.ts` (sign-in, sign-out, vault list, key check), `sync-socket.ts` (init, pushes until ready, pull
   in pieces, timeouts), the fake service `src/vault/testing/fake-headless-sync.ts` and the source contract against
   `headless-sync-source.ts`. Done when crypto vectors, the contract, error mapping, stale reads and host checks pass.
2. **Store, link and dispatch** (test-after on PGlite): migration 0008, `store.ts`, `headless-sync-credentials.ts`,
   `link.ts` (sign-in → pending, list vaults, connect standard/e2ee, sign-out), settings, `open-source.ts`, request
   opener, sync jobs, export. Done when tests cover: wrong password and 2FA prompts, a key refused by the service, a
   sealed value not opening for another account, the export never carrying token or key, switching kinds dropping
   picks, and a sync of picked notes end to end on the fake.
3. **Panel, e2e and docs**: `/panel/source/headless-sync` (sign-in, vault list, E2EE password form), actions, the card
   on the source screen, the fake in `e2e/fake-services.mjs`, `e2e/source-headless-sync.spec.ts` (standard and E2EE,
   password never in a request body), privacy policy, `docs/deployment.md`, `.env.example`. Done when e2e and gates
   are green.

## Progress
- [x] Phase 1: crypto and protocol. (2ed79e7)
- [x] Phase 2: store, link and dispatch. (037fa69)
- [ ] Phase 3: panel, e2e and docs.

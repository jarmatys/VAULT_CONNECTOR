# Research: account-connects-headless-sync

## How the note app's sync service works (public docs and the public interoperable client's docs)
- The official headless client (`obsidian-headless`, `ob` CLI, open beta since 2026-03) needs Node 22 and an active
  Sync subscription. Its licence is `UNLICENSED`, so it is neither a dependency nor copied: the adapter is an
  independent implementation of the documented protocol (an MIT-licensed Go client documents the same protocol and
  its encryption).
- Account API (`https://api.<service>/`), JSON POSTs: `/user/signin` (email, password, `mfa`; answers a session token,
  or an error that mentions the 2FA code), `/user/signout`, `/user/info`, `/vault/list` (token,
  `supported_encryption_version`: answers `vaults` and `shared`, each with `id`, `name`, `host`, `salt`,
  `encryption_version`, and for a vault with **managed ("standard") encryption** also its `password`), `/vault/access`
  (token, vault id, key hash, host, version: checks a key).
- Sync socket `wss://<host>` (the host the list names): `init` with token, vault id, key hash, version, `initial`,
  device name and encryption version; `{res:"ok", perFileMax}` or `{res:"err", msg}`; then one `push` per record
  newer than the version (encrypted path and hash, `uid`, `size` = encrypted bytes, `folder`, `deleted`, times) and
  `{op:"ready", version}`. `{op:"pull", uid}` answers `{size, pieces, deleted}` then `pieces` binary frames
  (2 MiB each). `ping`/`pong` keep it alive.
- Encryption (all client side, also for "standard" vaults, whose password the service hands to the account's
  clients): key = scrypt(NFKC password, NFKC salt, N=32768, r=8, p=1, 32 bytes). Version 0: key hash SHA-256(key),
  contents AES-256-GCM (`iv || ct || tag`), paths AES-GCM with IV = SHA-256(path)[0..12]. Versions 2 and 3: HKDF-SHA-256
  sub-keys (key hash: salt = vault salt, info `ObsidianKeyHash`; contents: empty salt, `ObsidianAesGcm`; paths and
  hashes: AES-SIV RFC 5297 with CMAC key `ObsidianAesSivMac` and CTR key `ObsidianAesSivEnc`, both salted with the
  vault salt; the CTR step counts the last 16 bits).

## Can it run in the hosted runtime? (roadmap unknown 2)
Yes, without a container: the protocol is HTTPS plus one WebSocket, and the crypto is Web Crypto plus scrypt. Workers
open outbound WebSockets with the standard constructor; Node 22 has a global `WebSocket`. scrypt is not in Web Crypto,
so `@noble/hashes` (MIT, pure TypeScript) derives the key on every runtime, the browser included. The official client's
filesystem, SQLite state and file watcher are not needed: the adapter only lists and pulls.

## The secret (roadmap unknown 1, PRD OQ-1)
- Reading notes requires the vault key: the service never decrypts. A zero-knowledge path where the key stays with the
  person is not possible for a service that indexes the notes while the person's computer is off; the strongest
  available form is chosen instead.
- **Standard encryption:** nothing secret beyond the account's session token is involved; the list hands the managed
  password to the signed-in client. The adapter derives the key once at connect time and keeps only the key, sealed.
- **End-to-end encryption:** the person types the vault's encryption password in the panel; the browser derives the key
  (scrypt over the salt the page shows) and sends only the 32-byte key. The password field has no `name`, so it is
  never part of a form submission: the password never reaches the server, a log or the database. The server checks the
  key with `/vault/access` and stores it only sealed (envelope encryption: AES-256-GCM under `VAULT_SOURCE_KEYS`, a
  platform secret outside the database and the repository, bound to the account's id), opens it in memory for one
  sync step, never logs or exports it, and deletes it with the source on disconnect and on account deletion (cascade).
- The account's sign-in password passes through the server once (the service has no OAuth): it is used for one
  `/user/signin` call and not stored or logged; only the session token is kept, sealed, between the two steps of the
  panel in an httpOnly cookie (ten minutes), then with the key. Disconnecting signs the token out.

## The codebase
- Source interface `src/vault/sources/source.ts` (four calls), adapters `github/`, `s3/`, `dropbox/`; Dropbox is the
  closest model: no push, cursor = hash of the listing, `full_resync` when it moved, one listing per adapter lifetime.
- Sealing: `@softure-ai/connections` `sealSecret`/`openSecret` with `VAULT_SOURCE_KEYS` (`s3-credentials.ts`).
- Store `src/vault/sources/store.ts` with one row per account and per-kind columns guarded by CHECKs (migrations 0004,
  0007); dispatch in `open-source.ts`, `request-opener.ts`, `sync/sync-jobs.ts`; export in `erase/vault-privacy.ts`.
- Panel: `/panel/source` cards per kind, forms in `/panel/source/<kind>`; copy in `src/messages/en.ts`.
- e2e fakes on one port in `e2e/fake-services.mjs`; `ws` is already in the tree (added as a dev dependency).
- Privacy policy text names each processor; a new subprocessor (the sync service, reached on the account's behalf).

## Risks
- Interoperability with the live service is proved by the published spec and the RFC 5297 vector, not by a live
  call (no account in CI, no paid call without the owner). A live probe is an owner step before the release.
- The protocol is not an official public API and may change; failures map to `source.unexpected` and show in the panel.

---
change_id: sources-use-user-oauth
title: "Dropbox and GitHub links run on @softure-ai/connections/user-oauth"
status: archived
archived_at: 2026-11-18
roadmap_item: null
branch: claude/project-thread-x94t0i
created: 2026-11-18
updated: 2026-11-18
---

## Intent

VC-21 wrote its own OAuth client for each account's Dropbox (state, PKCE, code exchange, refresh, revocation) and VC-6
repeated the state and PKCE helpers, because `@softure-ai/connections` connected only the app's own accounts. The
package now has per-user OAuth (`@softure-ai/connections/user-oauth`, 0.8.0), so the sources use it and the local
copies go.

## Scope

- `@softure-ai/connections` to 0.8.0.
- Dropbox: the provider definition, the consent URL, the code exchange, refresh and revocation through the package;
  the refresh token sealed with `sealUserSecret` (bound to the account and `dropbox`).
- GitHub: the link's state, its hash and the PKCE challenge from the package.
- Remove the local random token, hash, challenge and base64url helpers and the hand-written token calls.

## Notes

- Research and frame skipped: the gap and its fix are in SOFTURE/AI
  `context/archive/2026-11-18-connections-user-oauth/`.
- The sealing context of a Dropbox refresh token changes. No instance has run a Dropbox source (nothing is deployed),
  so no stored value needs re-sealing; a self-hosted test instance reconnects Dropbox once.
- No screen changes: the Dropbox and GitHub screens keep their Notion kit components, so no new kit component.

## Decisions (auto)

- `exchangeDropboxCode`, `refreshDropboxToken` and `revokeDropboxToken` stay as thin adapters that map the package's
  codes to source codes, so the sync, the folder picker and the tests keep one language.
- `account_id` comes from the grant's `fields`.

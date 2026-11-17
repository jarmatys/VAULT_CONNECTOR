# Plan: account-connects-dropbox-source

## Approach
A third adapter of the vault source interface over the Dropbox API v2. The account names the vault's folder in its
Dropbox on `/panel/source/dropbox` and goes through Dropbox's OAuth (code flow, PKCE, offline access, read-only
scopes). The callback consumes the one-time state, exchanges the code, refuses a grant with any write scope, probes the
folder with one listing call, seals the refresh token with the vault keyring bound to the account and stores the
source. The adapter refreshes an access token once per lifetime (one sync step), lists the folder recursively and uses
a hash of the listing as the cursor, like S3; the five-minute check notices changes.

## Decisions (auto)
- Scopes `files.metadata.read files.content.read`; a token answer whose `scope` names anything with `write` is refused
  (`vault.dropbox_permissions`) and the token revoked. The owner registers a scoped app with either access type: with
  "App folder" the folder is relative to the app's folder, with "Full Dropbox" to the root. Read-only either way.
- The folder is typed before the OAuth step (stored on the link state, max 512 characters, `/`-separated, no `..`),
  empty means the root of the grant. Changing the folder is connecting again. No folder browser in this item.
- Link states gain a `kind` (`github`, `dropbox`) and a `dropbox_folder`; the GitHub flow keeps working unchanged.
- Cursor `dropbox-<sha256 of sorted path\trev lines>`; version = `rev`; read with `rev:<rev>`; `listChangesSince`
  answers `full_resync` when the cursor moved. Relative paths rebuilt from folder entry names (stable case).
- Caps: 50 000 files per listing (`source.too_large`), 25 MB per file, as for S3 and git.
- Status mapping: 401 and a refused refresh (`invalid_grant`) disconnected; 403 disconnected; 409 not found;
  429 rate limited with Retry-After; 5xx and network unavailable; anything else unexpected.
- Settings: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` and the vault keyring `VAULT_SOURCE_KEYS`; without all of them the
  Dropbox card says the instance is not set up. `DROPBOX_FAKE_ORIGIN` (loopback only) points the API and the
  authorize page at the e2e fake.
- Disconnecting a Dropbox source revokes its token best effort, then forgets the row.
- No new UI component: the screen is a plain server form with the theme's `Field` parts, so nothing goes to the kit.

## Phases
1. **Adapter** (TDD): `src/vault/sources/dropbox/dropbox-api.ts` (token, list, download calls and error mapping),
   `dropbox-source.ts`, `dropbox-folder.ts` (folder validation), an in-memory fake `src/vault/testing/fake-dropbox.ts`
   (token grants, list_folder with pages, download by rev, authorize approval) and the source contract run against
   the adapter. Done when the contract, pagination, relative-path case, caps and status mapping tests pass.
2. **Store, link flow and dispatch** (test-after on PGlite): migration `0006_add_dropbox_sources.sql`, `store.ts`
   (`StoredDropboxSource`, `saveDropboxSource`, link state kind and folder), `dropbox-credentials.ts`, `link.ts`
   (start, complete, revoke), settings, `open-source.ts`, sync jobs and the request opener on the dispatcher, labels.
   Done when tests cover: a state of another account refused, a write scope refused, a missing folder refused, a
   sealed token that does not open for another account, switching from S3 to Dropbox dropping picks, and a sync of
   picked Dropbox notes end to end on the fake.
3. **Panel, e2e and docs**: `/panel/source/dropbox` (form and errors), its action and callback route, the Dropbox card
   on the source screen, the fake Dropbox in `e2e/fake-services.mjs`, `e2e/source-dropbox.spec.ts`,
   `docs/deployment.md`, `.env.example`, wrangler secrets. Done when the e2e connects a Dropbox folder, refuses a
   denied authorization, lists the folder's folders in the picker, and the gates are green.

## Progress
- [ ] Phase 1: adapter.
- [ ] Phase 2: store, link flow and dispatch.
- [ ] Phase 3: panel, e2e and docs.

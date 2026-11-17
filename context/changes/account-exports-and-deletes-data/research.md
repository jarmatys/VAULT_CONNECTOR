# Research: account-exports-and-deletes-data

## What exists
- `@softure-ai/privacy` 0.2.3 is enabled in `softure.config.ts` with the legal documents only. It already provides the
  export route (`exportRoute`), the deletion action (`deleteAccountAction`, password plus confirmation, rate limited by
  `privacy-delete`), `collectUserData`/`eraseUserData` and the consent ledger. Contributors: auth (user, sessions,
  identities, resets), mcp-access (tokens, OAuth grants and codes), feature-switches, privacy's own consents. A module
  joins the export and the deletion through `defineModule({ privacy })` with `manifest.privacy.exports/deletes: true`.
- The deletion runs every contributor in one transaction, the app's contributors first, then modules in reverse
  dependency order, auth last. `vault` and `connector` depend on auth, so they run before the account row goes.
- App stores an account has, beyond the packages:
  - `vault.sources` (GitHub link or S3 location, the S3 key pair sealed), `vault.source_link_states` (PKCE verifier),
    `vault.shared_folders`, `vault.notes` (table of contents), `vault.passages` (index), `vault.index_states`,
    `vault.sync_runs`, `vault.sync_items`;
  - `connector.profiles` (the account's sentence about its vault);
  - object storage: one object per copied note under `v1/<HMAC prefix of the account>/<sha256 of the path>`
    (`src/vault/storage/note-storage.ts`). `FileStorage` has no list operation, so the keys are derived from the paths
    the tables hold (notes and the open run's items).
- Every vault table references `auth.users` with `ON DELETE CASCADE` (passages through notes), so rows already go
  with the account; the objects in storage do not.
- A sync step writes an object before it records the note row (`sync-step.ts` `handleItem`); it works only on items
  planned into `vault.sync_items`, and holds the account's lease for at most the jobs lease (120 s).
- Accounts created by GitHub sign-in hold a random password nobody knows (auth `oidc/accounts.ts`). Password reset is
  on (`passwordReset` with mailing), so such an account can set a password through "Forgot password" and then delete.
- The privacy policy (`src/messages/legal.ts`) already states deletion of account data, copies, index and tokens, and
  that encrypted backups keep them at most 31 days: the item's unknown is answered.
- PRD FR-20: the export is account data (settings, picked folders, connectors, payments), not the notes themselves.

## Risks
- Deleting objects inside the deletion transaction cannot roll back; a refusal later would leave rows pointing at
  missing copies. Objects must go after the commit.
- A sync step running during the deletion may put an object after the keys were taken; its items are planned, so their
  keys are in the list, and a delay past the lease covers the put.

## Notes
- Frame skipped: the outcome and the mechanism (the privacy package) are fixed by the PRD and the roadmap.

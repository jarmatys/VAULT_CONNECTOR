# Plan: account-exports-and-deletes-data

## Approach
The vault and connector modules become privacy contributors. The vault's deletion, inside the privacy transaction,
derives the object keys of the account's copies (notes and planned items) and queues them in a new table
`vault.object_erasures` that names no account, enqueues `vault.erase-copies` delayed past the sync lease, and deletes
the account's vault rows. The job deletes the queued objects in batches; an hourly schedule picks up leftovers. The
panel gets an "Account" screen with the export link and the deletion form of the privacy package in Notion cards; the
export route is mounted at `/api/privacy/export`.

## Decisions (auto)
- Export of the vault: the source without secrets (kind, status, repository or bucket location, dates), the picked
  folders, the copied notes by path with size and dates (no titles, tags or text: FR-20 says not the notes), the sync
  runs and the last index failure. Connector: the sentence about the vault.
- Objects are deleted after the commit by a job, not in the transaction; the queue table holds only object keys
  (HMAC prefix plus path hash), which name neither the account nor a note.
- The erase job is due 150 s after the deletion (sync lease 120 s), batches of 200 keys, continues itself while keys
  remain; `vault.erase-copies` is also scheduled every hour for keys a failed run left.
- Without a configured store and key secret nothing is queued: no copy can exist under this configuration.
- Pending sync and index jobs of a deleted account keep only its id and find nothing to do; they are left to finish.
- GitHub-only accounts confirm the deletion with a password set through "Forgot password"; the screen says so. A
  password-free confirmation is a generic privacy package change, proposed as a follow-up, not built here.
- Routes: page `/panel/account` (panel guard and layout), export `/api/privacy/export`, after deletion `/`.
- The privacy policy already covers deletion and backups (31 days); no text change.

## Phases
1. **Contributors and erasure** (TDD): migration `0006_create_object_erasures.sql`, `src/vault/erase.ts` (export,
   delete, erase job), `src/mcp/profile/privacy.ts`, manifests, queue and schedule, handlers. Done when a test deletes
   a fixture account with synced notes, an index, a sentence and an assistant token and finds no row of it in any
   schema, no object after the erase job, and the old token refused (401) while the other account still reads; and the
   export test shows the vault and connector parts with no secret.
2. **Account screen and e2e**: privacy routes and messages, `/panel/account` page, `/api/privacy/export` route, nav
   section, `en.ts` copy, e2e `e2e/account-privacy.spec.ts` (export downloads JSON of the account; wrong password
   refused; deletion lands on `/` and the old login fails). Done when the e2e passes locally on Node and CI is green.
3. **Close**: impl review, archive, roadmap `done_code`.

## Progress
- [x] Phase 1: contributors and erasure (cf94093); `npx vitest run src/vault/erase` 6/6 (two accounts, every
  `user_id` column in every schema, store prefixes, old token 401 through `/api/mcp`, planned items queued, no key
  secret, batches, failing and missing store, export without text or secrets); `npm test` 333/333
- [x] Phase 2: account screen and e2e (f23684a); Node e2e `e2e/account-privacy.spec.ts` + `e2e/accounts.spec.ts` 5/5 on
  local Postgres 16 with pgvector; workerd in CI. Evidence: project files
  `vault-connector/evidence/account-exports-and-deletes-data/` (01 account 1280 light, 02 account 390 dark)
- [x] Phase 3: close; impl review approved, change archived
- [x] Impl review: approved, the erase delay now holds against the hourly schedule

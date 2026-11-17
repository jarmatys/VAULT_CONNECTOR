---
change_id: account-connects-dropbox-source
verdict: approved
---

# Implementation review

- Drift from plan: none in scope. Two additions after master moved: the migration is `0007_add_dropbox_sources.sql`
  (VC-16 took `0006`), and the account export of VC-16 now names a Dropbox source by its folder; before, a Dropbox row
  would have been exported as a GitHub source with an empty repository. A test covers it and checks that neither the
  Dropbox account id nor the sealed refresh token is in the file.
- Read-only by construction: the link asks for `files.metadata.read` and `files.content.read` only, and a grant
  carrying any write scope, or missing a read one, is refused and revoked before anything is stored
  (`link.test.ts`). The adapter calls only list and download endpoints.
- Isolation: the link state is bound to the account and its hash only is stored; a state of another account is
  refused; the refresh token is sealed with the context `vault/sources/<userId>/dropbox`, so it does not open for
  another account (tested). The database holds the shape of every Dropbox row (`sources_dropbox_fields`,
  `source_link_states_kind_fields`).
- Untrusted input: the folder is validated before the consent page (no `..`, empty parts, backslashes or control
  characters, 512 characters at most); the error shown comes from a fixed list of codes, never from the URL.
- Failure paths: a declined consent, an expired or reused state, a missing folder and an unreachable Dropbox each have
  a code and a message; a revoked grant turns the source `disconnected` at the next sync (tested end to end on the
  fake); a 429 or 5xx is retried by the sync, not shown as disconnected.
- Disconnecting revokes the grant at Dropbox, best effort; the row is forgotten either way. Account deletion (VC-16)
  removes the row and the sealed token inside the privacy transaction without a network call, so the grant stays
  listed in the person's Dropbox settings until they remove it; it can no longer be used, since its token is gone.
  Accepted: a network call inside that transaction would make deletion depend on Dropbox.
- Caps: 50 000 files per listing and 25 MB per file, the same as the other sources.
- SOFTURE packages: `@softure-ai/connections` OAuth is operator-scoped, so the per-account link is built here on the
  package's `sealSecret`/`openSecret`. A per-account OAuth flow in the package is an idea for later, not a gap that
  blocks this item; no issue filed.
- Gates: typecheck, lint (with the language gate), `npm test` 44 files / 364 tests. The e2e spec
  `source-dropbox.spec.ts` (invalid folder, declined consent, missing folder, connect, picker, disconnect) runs on both
  hosts in CI; this container has no pgvector for a local run.

Verdict: approved.

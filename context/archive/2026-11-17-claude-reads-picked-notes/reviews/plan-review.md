---
change_id: claude-reads-picked-notes
verdict: approved
---

# Plan review

- Scope matches change.md and FR-11, FR-13 to FR-17: OAuth with dynamic registration and consent, three read-only
  tools with titles and hints, markers, instructions with the account's sentence, tokens listed and revoked in the
  panel, an isolation test. Search (FR-12) and its quota are VC-11; the status tool says what it has now.
- Isolation (NFR-2): the copy can briefly hold notes of a folder just unpicked. The plan filters every read by the
  current picks; added to phase 1 and phase 2: a row and a copy left from an unpicked folder are invisible to every tool.
- Ownership: lane B owns the `vault` schema; the sentence goes to a separate `connector` schema owned by this lane, so
  VC-10's migrations in flight do not collide. Shared files: `softure.config.ts` (append only), `src/messages/en.ts`,
  `panel-sections.ts`, `src/jobs/handlers.ts` (append only).
- Prompt injection: titles, tags and descriptions are note-derived, so the whole index body sits in markers, not only
  the note text; the sentence too. Added: defusing a marker inside wrapped text (tested).
- Read-only by construction: `allowWrites: false` and no write tool; phase 2 checks rows and objects unchanged after a
  full tool run (FR-16's checksum).
- Workers: the module declares `workers`; the endpoint answers JSON or one SSE event, no long stream; e2e runs on both
  hosts.
- Migration: additive, forward only, rollback in the file header.

Verdict: approved with the additions above.

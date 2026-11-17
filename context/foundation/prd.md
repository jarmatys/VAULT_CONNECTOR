---
project: "VaultConnector"
version: 2
status: accepted
context_type: greenfield
created: 2026-11-17
updated: 2026-11-17
source: shape-notes.md (session 1)
---

# PRD v1: an Obsidian vault in the assistant, from the phone, without a computer

## Summary
- Problem: an Obsidian user with a paid assistant plan cannot ask their notes from the phone without leaving a
  computer running, editing config files, sharing the whole vault and paying for whole files in tokens; many give up
  or leave Obsidian for a service with its own AI.
- Insight: the vault does not have to move. A read-only copy of only the picked folders, indexed on the server and
  reached through the assistant's own connector directory, answers all five complaints at once, and the folder choice
  is what makes people trust it.
- Who: an Obsidian user who is not a developer and uses Claude (later ChatGPT) on the phone.
- Outcome: in two minutes they connect their vault, pick folders and add the connector; from then on the assistant
  answers from those notes with the note's path, at any time, with their computer off.
- Appetite: one roadmap from an empty repository to a hosted, paid, directory-listed service plus the first extra
  sources and ChatGPT; deadline: none (set by the owner after the roadmap).
- Product: web app with a remote MCP server; expected scale: thousands of accounts at most in the first year.
- Release boundary: hosted and self-hosted versions from one codebase, git, S3-compatible and Dropbox sources, Claude
  and ChatGPT, paid plans.

## Goals
- G-1: a visitor can join the waitlist and read the privacy policy on the product's own site (gate 0); yes/no.
- G-2: a new account goes from sign-up to the assistant's first answer from its notes in ≤ 2 minutes on the reference
  fixture vault (gate 1).
- G-3: the connector meets every known requirement of the Claude connector directory and is ready for submission
  (gate 1); yes/no checklist.
- G-4: an account can pay for a plan on the product's site and keeps access for the paid period (gate 2); yes/no.
- G-5: a self-hosting user starts the same product with one compose file and a short guide; yes/no.
- G-6: the vault can come from git, S3-compatible storage or Dropbox, and the server works in ChatGPT as in Claude.

## Non-goals
- Writing into the vault — read-only is the trust promise.
- Shared or team vaults — one account, one vault in this release.
- Real-time freshness — a change in the vault reaches the assistant within minutes, not seconds.
- Our own AI chat — the user's assistant is the interface.

## Users
- Primary: an Obsidian user with a paid assistant plan, not a developer, asking their notes from the phone during the
  day.
- Secondary: a developer or privacy-minded user who self-hosts; the operator (owner) who handles billing and support.
- Not for: people who want write access, teams, vaults with no copy outside one device.

## Access control
- Anyone can register (email and password, or GitHub) unless registration is closed by a switch.
- An account sees and manages only its own source, folders, connectors and data.
- An assistant reaches an account's notes only with a token the account approved (OAuth) or issued, and only in the
  account's picked folders; tokens can be revoked in the panel.
- The admin role grants plans and refunds and sees account metadata, never note content.
- Visitors see the landing page, waitlist, legal pages and documentation.

## Primary flow
1. A visitor opens the landing page and signs up (FR-1, FR-4).
2. They connect a git repository as the vault source, read-only (FR-6).
3. They see the vault's folder tree and pick folders; nothing is shared before that (FR-8).
4. The product copies and indexes only the picked folders and shows progress (FR-7, FR-9, FR-10).
5. They add the connector to Claude from the panel and approve it (FR-11, FR-16).
6. On the phone they ask; the assistant uses the tools and answers with note paths (FR-12, FR-13, FR-14, FR-15).

## Business rules
Core rule: an assistant connected to an account reads only notes inside the folders that account picked, never
writes, and never reaches another account's notes.

The account supplies the source and the folder picks. Unpicking a folder, disconnecting the source or deleting the
account removes the copies and the index of what is no longer shared. Every tool answer that carries note text marks it
as untrusted data. When a plan's access ends, the account's data stays for a grace period and the tools answer with a
message pointing to the payment page instead of note content.

## Functional requirements
| ID | Requirement (observable behaviour) | Priority | Goal | Module |
|---|---|---|---|---|
| FR-1 | A visitor sees what the product does, the five pains it answers, the source code link, and joins the waitlist | must | G-1 | @softure-ai/waitlist |
| FR-2 | A visitor reads the privacy policy and the terms; every page carries the legal footer | must | G-1, G-3 | @softure-ai/privacy |
| FR-3 | The operator sees the funnel from visit to waitlist to account, without cookies | should | G-1 | @softure-ai/analytics |
| FR-4 | A visitor registers and signs in with email and password or with GitHub, and can reset a password | must | G-2 | @softure-ai/auth |
| FR-5 | A signed-in account sees a panel with its source, folders, index status, connectors and plan | must | G-2 | — |
| FR-6 | An account connects one git repository as its vault source with read-only access it can revoke | must | G-2 | @softure-ai/connections |
| FR-7 | After a change is pushed to the source, the shared copy follows within minutes, with no action by the account | must | G-2 | @softure-ai/jobs |
| FR-8 | An account sees its vault's folder tree and picks the folders to share; nothing is shared before it picks | must | G-2 | — |
| FR-9 | The picked folders are searchable by keyword and by meaning, in mixed languages | must | G-2 | — |
| FR-10 | The panel shows indexing progress, the note count and the time of the last sync, and the reason of a failed sync | must | G-2 | — |
| FR-11 | An assistant connects to the account's MCP server through OAuth 2.1 with dynamic registration; tokens can be listed and revoked | must | G-2, G-3 | @softure-ai/mcp-access |
| FR-12 | The assistant searches the shared notes and gets ranked passages with each note's path | must | G-2 | — |
| FR-13 | The assistant reads one whole shared note by path | must | G-2 | — |
| FR-14 | The assistant browses a table of contents of the shared folders (tree, filter by name, title, tags), without using search quota | must | G-2 | — |
| FR-15 | The assistant reads the status: note count, last sync, quota used | should | G-2 | — |
| FR-16 | Every tool is read-only, carries a title and a read-only hint, and marks note text as untrusted data | must | G-3 | — |
| FR-17 | The server tells the assistant when to use it, including a sentence the account writes about what its vault holds | must | G-2 | — |
| FR-18 | Each plan has limits (notes, storage, searches a month); a request over a limit is refused with a clear message | must | G-4 | @softure-ai/billing, @softure-ai/metering |
| FR-19 | An account starts with a trial, pays monthly or yearly on the product's site, and keeps access for the paid period | must | G-4 | @softure-ai/billing |
| FR-20 | An account exports its data and deletes its account; deletion removes copies, index and tokens | must | G-3 | @softure-ai/privacy |
| FR-21 | The documentation explains setup, tools, privacy and self-hosting; a reviewer test account can be prepared | must | G-3 | @softure-ai/agent-ready |
| FR-22 | A self-hosting user runs the product with one compose file and the guide | must | G-5 | — |
| FR-23 | An account uses an S3-compatible bucket as its vault source, read-only | should | G-6 | — |
| FR-24 | An account uses a Dropbox folder as its vault source, read-only | should | G-6 | @softure-ai/connections |
| FR-25 | The same server works as a connector in ChatGPT; payment is linked to the product's site, never sold in the app | should | G-6 | — |
| FR-26 | An account uses Obsidian's headless sync as its vault source | could | G-6 | — |
| FR-27 | The operator is alerted when syncs or indexing fail repeatedly, and sees the background work's health | should | G-2 | @softure-ai/alerts, @softure-ai/jobs |

### Gate 0: landing

#### FR-1: landing and waitlist
Acceptance:
- Given a visitor on the home page, when they submit an email with the required consent, then they see a confirmation
  and receive a welcome message; submitting the same address again says it is already on the list.
- Given no consent ticked, the sign-up is refused and nothing is stored.
Notes: copy follows DESIGN.md (plain English, privacy as fact); footer links the source code (AGPL section 13).
Challenge: "a landing page before the product is waste" → it is gate 0, the cheap demand test the owner chose.

#### FR-2: legal pages
Acceptance:
- Given any page, when a visitor scrolls to the footer, then links to the privacy policy, the terms and the source code
  are there.
- The privacy policy names: what is stored (copies of picked folders, the index, account data), where (EU), the
  processors, retention after deletion, no training, and how to delete.

#### FR-3: funnel
Acceptance:
- Given visits, sign-ups and registrations over a day, when the operator opens the funnel, then each step shows a daily
  count and no cookie was set.

### Gate 1: hosted MVP

#### FR-4: accounts
Acceptance:
- Given a new email, when a visitor registers with a password and the consent, then they land in the panel signed in.
- Given a GitHub account, when a visitor chooses GitHub, then an account is created or the existing one is signed in.
- Given a forgotten password, when the visitor asks for a reset, then a one-time link arrives and works once.

#### FR-5: panel
Acceptance:
- Given a new account, the panel shows the next step (connect a source) and nothing else to configure.
- Given a connected, indexed account, the panel shows source, picked folders, note count, last sync, connectors, plan.

#### FR-6: git source
Acceptance:
- Given an account, when it connects a repository, then the product reads only that repository, read-only, and the
  panel names it.
- Given the access is revoked at the source, when the next sync runs, then the panel says the source is disconnected
  and the tools say so to the assistant.
- Empty case: a repository with no Markdown notes is accepted and shows zero folders.

#### FR-7: sync
Acceptance:
- Given a shared folder, when a note is added, changed or removed at the source, then within 10 minutes the tools return
  the new state.
- Given a note over the size limit or a non-Markdown file, it is skipped and counted in the panel, not an error.
- Failure: a source error is retried; after repeated failures the panel shows the reason.

#### FR-8: folder picker
Acceptance:
- Given a connected source, when the account opens the picker, then it sees the folder tree with note counts and
  nothing ticked.
- When it ticks folders and saves, then only notes inside them become available to the tools.
- When it unticks a folder, then its notes disappear from every tool answer and their copies and index are removed.

#### FR-9: hybrid search
Acceptance:
- Given the fixture vault (English, Polish and German notes), when searching by an exact word, a phrase or a paraphrase,
  then the expected note is in the top 5 for at least 90% of the fixture queries.
- A search never returns a passage from an unpicked folder or another account (tested).

#### FR-10: index status
Acceptance:
- During indexing the panel shows done and total; after it, the note count and last sync time; after a failure, the
  reason in plain words.

#### FR-11: OAuth connection
Acceptance:
- Given the panel's "Add to Claude" step, when the account adds the connector URL in Claude and approves the consent
  page, then Claude lists the tools.
- Given a revoked token, the next tool call is refused with 401.
- The consent page names the account and that access is read-only.

#### FR-12: search tool
Acceptance:
- Given a question, the tool returns at most the requested number of passages (default 8, max 20), each with path,
  score and the passage marked as untrusted data; an optional folder narrows the search.
- Empty case: "no results" with the query echoed. Over quota: a message with the reset date; other tools keep working.

#### FR-13: read note tool
Acceptance:
- Given a path inside a shared folder, the whole note returns (cut with a note past a size limit).
- Given a path outside the shared folders or unknown, "not found" with a hint to use the table of contents.
- Paths with non-ASCII characters resolve (Unicode normalisation).

#### FR-14: table of contents tool
Acceptance:
- No arguments: top folders with note counts, last change and the folder note's description.
- `folder`: subfolders and notes; `filter`: notes matching all words in path, title, tags or aliases, case- and
  accent-insensitive; `sort` by name or recent. No search quota used.

#### FR-15: status tool
Acceptance:
- Returns note count, last sync time, searches used and the limit this month.

#### FR-16: tool safety
Acceptance:
- Every tool in the tool list carries `title` and `readOnlyHint: true`; no tool changes source data (tested by
  checksum of the source before and after a full tool run).
- Every note text in a result sits between untrusted-data markers.

#### FR-17: server instructions
Acceptance:
- On initialize the server sends instructions: when to use the tools, in which order, and the account's own sentence
  about its vault (empty allowed, length-limited, stored as data).

#### FR-21: documentation and reviewer
Acceptance:
- Public docs pages: getting started, tools, privacy and security, self-hosting, FAQ.
- An operator command prepares a reviewer account with a fixture vault and a time-limited sign-in.

#### FR-27: operator alerts
Acceptance:
- Given three failed syncs in a row for one account, or no successful jobs tick for 10 minutes, the operator gets one
  alert and one recovery message.

### Gate 2: payment

#### FR-18: limits
Acceptance:
- Given a plan's note limit, when a sync would exceed it, then the extra notes are not indexed and the panel and
  status tool say so.
- Given the search limit reached, search is refused with the reset date; table of contents and read note keep working.

#### FR-19: payment
Acceptance:
- Given a new account, it has a trial with full access; the panel shows the days left.
- When it pays a monthly or yearly plan on the payment page, then access extends by the period.
- When access ends, the tools return a message pointing to the payment page; data is kept for the grace period, then
  removed.

#### FR-20: export and deletion
Acceptance:
- Export gives a JSON file of account data (settings, picked folders, connectors, payments), not the notes themselves.
- Delete removes the account, its copies, index and tokens; a later tool call with an old token is refused.

### Self-hosting and reach

#### FR-22: self-hosting
Acceptance:
- Given the compose file and the guide, a user starts the stack, registers, connects a source and gets search results,
  with no external account other than the source's.

#### FR-23, FR-24, FR-26: more sources
Acceptance (each):
- Given valid read-only credentials (S3: endpoint, bucket, prefix, keys; Dropbox: OAuth; headless sync: no stored
  encryption password, per OQ-1), the picker, sync, index and tools behave exactly as with git.

#### FR-25: ChatGPT
Acceptance:
- Given ChatGPT's connector setup, the account adds the server and the tools answer as in Claude; no plan or price
  appears inside ChatGPT.

## Non-functional requirements
- NFR-1: search tool answer < 3 s at p95 for a vault of 5,000 notes; table of contents and read note < 1 s at p95.
- NFR-2: no tool answer ever contains content from another account or an unpicked folder (an automated isolation test
  on every change touching the tools, sync or index).
- NFR-3: account data, copies and index are stored in the EU on the hosted version.
- NFR-4: storage paths do not reveal the account they belong to.
- NFR-5: a change at the source is visible to the tools within 10 minutes (hosted).
- NFR-6: hosted running cost close to zero with no traffic and growing with the number of active accounts.
- NFR-7: no secret, personal data or server address in the public repository (gated in CI).

## Success metrics
| Metric | Baseline | Target | How measured | When checked |
|---|---|---|---|---|
| Waitlist sign-ups | 0 | first 100 | analytics funnel (FR-3) | after the landing goes live |
| Time from sign-up to first answer | none (no product) | ≤ 2 min | end-to-end test on the fixture vault, timed (FR-4..FR-14) | end of the roadmap |
| Directory checklist | 0 / 7 | 7 / 7 | checklist in the docs (FR-16, FR-21) | before submission |
| Paying accounts | 0 | 1 outside the owner's network | billing (FR-19) | after payment goes live |

### Guardrails
- Cross-account or unpicked-folder leaks: 0 (NFR-2).
- Tool calls that change source data: 0 (FR-16).
- Search p95 stays under NFR-1 as vaults grow.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Indexing a large vault does not fit the background budget | medium | high | small resumable steps; measured in the index item |
| Search quality on mixed languages disappoints | medium | high | measured on fixtures before choosing the model |
| Prompt injection from note content | high | medium | read-only tools, untrusted-data markers, instructions |
| Directory review rejects the connector | low | high | checklist item before submission |
| Free self-hosted alternatives undercut the hosted plan | high | medium | two-minute setup, directory listing, trust |

## Out of scope
- Write tools — never in this product line.
- Team vaults, sharing between accounts — later, if asked.
- Real-time sync below a minute — later.
- Mobile app of our own — never; the assistant's app is the interface.

## Open questions
- OQ-1 (answered, owner 2026-11-17): does the hosted service hold a headless-sync encryption password? → no. The
  hosted service never stores a vault's encryption password. If headless sync needs a secret for an end-to-end vault,
  it is entered per sync session or kept only envelope-encrypted (a per-account key wrapped by a master key held outside
  the database), used in memory for one sync job, never logged or exported, and deleted on disconnect; a path where the
  key stays on the user's side is preferred. The design is settled in research of FR-26 → blocking: no
- OQ-2: plan prices and currency → owner: owner → needed by: release of FR-19 → blocking: no (placeholders until then)
- OQ-3: embedding model and where it runs → owner: research → needed by: FR-9 → blocking: no

## Changelog
- v1 2026-11-17: first version from shape-notes session 1.
- v2 2026-11-17: OQ-1 answered by the owner (no stored encryption password); FR-26 no longer blocked.

## Decisions (auto)
- Status set to accepted → autonomous mode; the owner corrects later.
- FR-26 (headless sync) kept as `could` → OQ-1 is answered, but it is the last source and the riskiest one.
- ChatGPT and extra sources included in this PRD → the owner asked for a roadmap that realises the whole product.

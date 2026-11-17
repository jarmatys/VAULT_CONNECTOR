---
project: "VaultConnector"
session: 1
context_type: greenfield
created: 2026-11-17
updated: 2026-11-17
status: accepted
---

# Shape notes: an Obsidian vault in the assistant, from the phone, without a computer

Shaped in `--auto` (autonomous mode) from the owner's product notes, the market analysis kept outside this repository
(summarised in `docs/planning-context.md`), and the owner's private single-user prototype, which this product turns
into a service for many users.

## Problem

An Obsidian user who pays for Claude (and later ChatGPT) wants to ask their own notes from the phone app. Every way to
do it today breaks on one of five points, all repeated in user complaints:

1. a local MCP server works only while the computer is on and awake;
2. setup is beyond a non-developer (config files, terminals, Docker, tunnels);
3. search is weak and expensive: whole files land in the context and burn tokens;
4. people want to share only some folders, read-only, and existing tools share the whole vault;
5. the assistant does not know it has the tool and has to be reminded in every chat.

The cost today: people either give up, keep a laptop running, or move their notes to a service with its own AI
(leaving Obsidian), which is the outcome they wanted to avoid.

## Who it is for

- **Primary:** an Obsidian user with a paid assistant plan who reaches for the phone app mid-day ("what did I agree
  with X", "when is my appointment") and is not a developer. Their vault already lives somewhere the product can read
  (a git repository first).
- **Secondary:** a developer or privacy-minded user who runs the same code on their own server (self-hosted).
- **Not for:** people who want the assistant to write into the vault, team or shared vaults, and anyone whose vault
  sits only on one device with no copy the product can reach.

## Access

Anyone can sign up for the hosted version (email and password, or GitHub). Each account sees and connects only its own
vault. The assistant reaches an account's notes only through a connector the account holder authorised (OAuth), and
only in the folders that account picked. An unauthenticated visitor sees the landing page, the waitlist, the legal
pages and the documentation. The operator (the owner) has an admin role for billing and support, and does not browse
note content in the panel.

## Today

The owner runs a private single-user prototype: a read-only remote MCP server on Cloudflare Workers with OAuth for
claude.ai, a scheduled sync from a git repository, hybrid search (vector plus keyword) with passages, a table of
contents that costs no search quota, a full-note read, a status tool, server instructions that tell the assistant when
to use it, vault content marked as untrusted data, an ignore list and a monthly search cap. It answers four of the five
pains for one person. What it lacks for a product: many users, a panel instead of config files, folder choice in a UI,
sources other than git, payment, and self-hosting.

## Why now

Obsidian added a headless sync client and an official CLI for agents, assistants accept community connectors in their
directories (a distribution channel with in-chat suggestions), and the competing hosted services require leaving
Obsidian. Nobody sells a managed service for an existing vault yet; at least one open-source project has announced a
managed tier.

## Appetite

One roadmap that takes the product from an empty repository to a hosted, paid service listed in the Claude connector
directory, plus the first extra sources and ChatGPT. Built by agents in autonomous mode; no calendar deadline (the owner
sets the timeline after the roadmap). Gate order from the owner's notes: gate 0 (landing and waitlist), gate 1 (hosted
MVP and directory submission), gate 2 (payment and the first paying user), then more sources and ChatGPT.

## Solution sketch

First flow, the one the product is judged by:

1. A visitor signs up from the landing page.
2. They connect a vault source: install the product's GitHub App on one repository, read-only.
3. They see their vault's folder tree and pick the folders to share. Nothing is shared until they pick.
4. The product copies and indexes only those folders; the panel shows progress and the note count.
5. They add the connector to Claude with one link and approve it (OAuth).
6. On the phone, they ask a question; the assistant searches, reads the passages it needs and answers with the note's
   path.

Elements:

- landing page, waitlist, privacy policy and terms, funnel analytics (`@softure-ai/waitlist`, `privacy`, `analytics`,
  `seo`, `agent-ready`);
- accounts and sessions (`@softure-ai/auth`, GitHub sign-in included), mail (`@softure-ai/mailing`);
- vault sources behind one interface: git through a GitHub App first, then S3-compatible storage and Dropbox, then
  Obsidian's headless sync;
- per-account copies of the shared folders in object storage under a prefix derived from a keyed hash of the account
  id (`@softure-ai/files`);
- a per-account hybrid index (keyword plus meaning) built in background jobs (`@softure-ai/jobs`);
- the MCP server with four read-only tools taken from the prototype (search, read a note, table of contents, status),
  OAuth 2.1 for the assistants (`@softure-ai/mcp-access`), and server instructions the account can extend with a
  sentence about what its vault holds;
- plans, trial and payment on the product's own site (`@softure-ai/billing`), limits per plan;
- data export and deletion (`@softure-ai/privacy`);
- one codebase on two hosts: Cloudflare (hosted) and Docker Compose (self-hosted), switched by configuration.

## Core rule

An assistant connected to an account reads only notes inside the folders that account picked, never writes, and never
reaches another account's notes.

## Rabbit holes

- **Indexing a large vault inside a short background budget.** Scheduled work on the hosted platform has a budget of
  tens of seconds per run; a vault of thousands of notes must be split into small resumable steps. Decided: many small
  jobs, each finishing well inside the budget, resumable by cursor; a platform queue only if measurement shows the job
  table cannot keep up.
- **Search quality on mixed-language notes.** Users write in many languages. The embedding model and the keyword
  tokenizer are chosen in research by measurement on fictional mixed-language fixtures, not by name.
- **Where processing happens.** The hosted promise is "EU": storage and database in the EU; whether embedding runs in
  the EU is settled in research and stated honestly in the privacy policy.
- **Holding a sync encryption password.** Obsidian's headless sync needs the vault's end-to-end password. Holding it on
  the hosted service changes the trust story; it stays an owner decision.
- **Prompt injection through notes.** Saved web pages and mails in a vault carry instructions. Every tool result marks
  note text as untrusted data; tools are read-only, so injected text cannot act.

## No-gos

- No writing, moving or deleting notes through the assistant.
- No sharing a folder the account did not pick; no "share everything" default.
- No training on notes, no reading of note content by the operator in the panel.
- "Obsidian" never in the product name; the accent colour is not Obsidian's purple.
- No second SQL dialect: the same Postgres schema on both hosts.

## Success signals

- Gate 0: waitlist sign-ups from the landing page (counted by the funnel).
- Gate 1: a new account goes from sign-up to a first answer on the phone in two minutes or less on a fixture vault;
  the connector is submitted to the Claude directory.
- Gate 2: the first paying account from outside the owner's network.
- Guardrails: zero cross-account reads (tested), zero tool calls that change a vault, search answers in under a few
  seconds.

## Open questions

- Does the hosted service ever hold a headless-sync encryption password? (owner; gates the headless-sync source)
- Price points and currency of the hosted plans (owner; the roadmap builds the plans with placeholder values).
- Which embedding model and where it runs (research, in the search item).

## Forward notes

- Hosting (owner, 2026-11-16 and 2026-11-17): Cloudflare Workers through OpenNext, R2 with the EU jurisdiction,
  Postgres (Neon, EU region) through Hyperdrive with pgvector; Cron Triggers drive the jobs tick. Not D1: every
  `@softure-ai/*` module speaks Postgres, D1 is SQLite (a second dialect), has no vector type and caps one database at
  10 GB, and the self-hosted version would need a different database.
- Self-hosted: the same code on `vps+node` with Postgres and pgvector and an S3-compatible or local store.
- Gaps found in `@softure-ai/*` packages are fixed in SOFTURE/AI directly by the session that meets them (owner,
  2026-11-16), kept generic.

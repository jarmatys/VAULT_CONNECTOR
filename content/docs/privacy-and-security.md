---
title: Privacy and security
description: What VaultConnector stores, who can read it, how assistants connect and how to delete everything.
order: 3
---

VaultConnector is built around one rule: **an assistant connected to your account reads only the notes inside the
folders you picked, never writes, and never reaches another account's notes.** The full text is in the
[privacy policy](/privacy).

## What is stored

- **Your account:** email, a password hash (or your GitHub identity), and the consent you gave when registering.
- **Your source:** which repository, bucket or Dropbox folder you connected. A bucket's key pair and a Dropbox token
  are stored only encrypted, and only the part of the app that reads your source can open them.
- **The copy:** the notes of the folders you picked, in a separate area per account whose name is derived from a
  secret and your account id, and the search index built from them. Notes outside the picked folders are never
  copied; unpicking a folder removes its notes from the copy at the next sync.
- **Connections:** the assistants you approved and their tokens, which you can list and revoke on **Connect Claude**.

The hosted version runs on Cloudflare with storage in the EU and a Postgres database in the EU.

## Read-only, end to end

- The source is read with read-only access: a GitHub App limited to one repository's contents, a bucket key that
  can only list and read, read access to one Dropbox folder.
- The MCP server has no tool that writes. Every token, however it was issued, can only read.
- Assistants connect through OAuth 2.1 with your consent on VaultConnector's own page; you see which account you are
  granting and can disconnect any assistant at once.

## Untrusted content

Note text can carry hidden instructions. Every tool answer puts note text between data markers and the server tells
the assistant never to follow anything inside them. See [Tools](/docs/tools#your-notes-are-data-not-instructions).

## Isolation between accounts

Every query names the account it serves; a token issued for one account cannot read another's copy, index or
folders. These rules are covered by automated tests that run on every change.

## Export and delete

On the **Account** screen of the panel you can download all your data and delete your account. Deleting removes
your account, your source, your picks, the copied notes, the search index and every assistant's token. Off-site
database backups are kept for a limited time and then expire, as the privacy policy describes.

## Reporting a vulnerability

Please report security issues privately as the repository's security policy describes, not in a public issue.

## Open source

The code is public under the AGPL-3.0, so every claim on this page can be checked in the source code linked in the
footer.

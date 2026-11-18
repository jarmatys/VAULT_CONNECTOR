---
title: Getting started
description: Connect your vault, pick the folders to share and add VaultConnector to Claude, in about two minutes.
order: 1
---

VaultConnector lets Claude (and ChatGPT) read the notes you choose from your Obsidian vault, on any device, with no
computer left running. Your assistant reads only the folders you pick, and never changes a note.

## 1. Create an account

Register with your email and a password, or sign in with GitHub. The panel opens on its overview, which shows the
three steps below and ticks each one off as you finish it.

## 2. Connect your vault

Pick where your vault lives:

- **A git repository on GitHub.** Install the VaultConnector GitHub App on the one repository that holds your vault.
  It asks for read-only access to that repository's contents; nothing else.
- **An S3-compatible bucket** (Cloudflare R2, Amazon S3, Backblaze B2, MinIO and others). Give the endpoint, the
  bucket, an optional folder inside it and a key pair that can only list and read.
- **A Dropbox folder.** Approve read access in Dropbox and choose the folder that holds your vault.

You can revoke the access at any time at the source (uninstall the app, delete the key, disconnect Dropbox); the
panel shows the source as disconnected and stops reading it.

## 3. Pick the folders to share

The panel shows your vault's folder tree. Tick the folders your assistant may read and save. **Nothing is shared
before you pick**, and a note outside the picked folders is never copied. VaultConnector copies the picked notes and
builds a search index; the overview shows the progress. When you push a change to your vault, the copy follows within
minutes.

## 4. Add the connector to Claude

Open **Connect Claude** in the panel and copy the connector URL. It ends in `/api/mcp`.

1. In Claude, open **Settings → Connectors** and choose **Add custom connector**.
2. Paste the URL and add it. Claude opens VaultConnector's consent page.
3. Sign in if asked, check the account shown and allow read access.

The connection is listed under **Connected apps**, where you can disconnect it at once. For ChatGPT, see
[Connect ChatGPT](/docs/chatgpt).

## 5. Ask

On your phone or anywhere else, ask about your notes: "What did I decide about the garden shed?" Claude looks at
the table of contents, searches when it needs to, reads the notes it found and names their paths in the answer. The
[tools page](/docs/tools) explains what it can do.

---
title: FAQ
description: Short answers to the questions people ask before connecting their vault.
order: 5
---

## Does my computer need to stay on?

No. VaultConnector keeps a copy of the folders you picked and follows changes from your source, so your assistant
can read them from your phone when your computer is off.

## Can the assistant change my notes?

No. Every tool is read-only, the source is read with read-only access, and no token can write.

## Which notes can it read?

Only the notes inside the folders you picked in the panel. Nothing is shared until you pick.

## Is this an Obsidian product?

No. VaultConnector is an independent service for Obsidian vaults. Obsidian is a trademark of its owner.

## Where does my vault have to live?

In a git repository on GitHub, an S3-compatible bucket or a Dropbox folder. The panel connects one source per
account.

## Which assistants work?

Claude (on the web, desktop and mobile) and ChatGPT, through the same connector URL. Any client that supports remote
MCP servers with OAuth can connect too, and the **Connect Claude** screen can also issue a token by hand.

## What if a note contains instructions?

They are treated as data. The tools mark note text as untrusted and the server tells the assistant never to follow
it. See [Privacy and security](/docs/privacy-and-security).

## How do I stop sharing?

Unpick a folder to remove its notes from the copy, disconnect an assistant on **Connect Claude**, or delete your
account on **Account**, which removes the copies, the index and every token.

## Can I run it myself?

Yes, for free: see [Self-hosting](/docs/self-hosting).

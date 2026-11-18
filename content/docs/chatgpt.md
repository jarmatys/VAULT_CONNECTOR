---
title: Connect ChatGPT
description: Add VaultConnector to ChatGPT as a custom MCP connector and ask your shared notes from any device.
order: 6
---

VaultConnector is one MCP server for every assistant. ChatGPT uses the same connector URL, the same sign-in and the
same four read-only tools as Claude.

## Before you start

- A VaultConnector account with a vault source connected and at least one folder picked (the panel's overview shows
  the steps).
- A ChatGPT plan whose workspace lets you add custom MCP servers. In a business or enterprise workspace an admin may
  have to allow it first.

## Add the connector

1. In the panel, open **Connect Claude** and copy the connector URL. It ends in `/api/mcp`, for example
   `https://vault.example/api/mcp`.
2. In ChatGPT, open the plugins (apps and connectors) page, select the plus button, then **Add custom MCP server**.
3. Enter a name (for example *VaultConnector*) and a short description such as "My notes, read-only".
4. Under **Connection**, choose a public endpoint and paste the connector URL.
5. Under authentication, choose **OAuth**. ChatGPT registers itself with VaultConnector; there is no client id or
   secret to copy.
6. Review the risk warning, confirm, and create the plugin. ChatGPT lists the four tools it found: `vault_index`,
   `get_note`, `search_vault` and `vault_status`, all read-only.
7. ChatGPT opens VaultConnector's consent page. Sign in if asked, check the account shown, and allow read access.

The connection appears under **Connected apps** on the **Connect Claude** screen, next to any Claude connection.
Disconnect it there to end ChatGPT's access at once.

## Use it in a chat

Start a new conversation, type `@` and pick VaultConnector, or just ask about your notes: "What did I plan for the
client review?" ChatGPT searches the folders you shared and reads the notes it needs. It never changes your vault.

## Plans and payment

Nothing is sold inside ChatGPT. If your access has ended, the tools say so and point to the VaultConnector website;
renewing happens there, in the panel, never in the chat.

## Troubleshooting

- **ChatGPT cannot connect.** Check that the URL ends in `/api/mcp` and that it opens over `https`.
- **The tools answer that nothing is shared yet.** Pick folders in the panel and wait for the first copy to finish
  (`vault_status` shows its progress).
- **ChatGPT asks to sign in again.** Its connection was disconnected in the panel or has expired; connect it again.

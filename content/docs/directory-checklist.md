---
title: Directory checklist
description: What the Claude connector directory checks, and where VaultConnector meets each point, with the tests that prove it.
order: 7
---

Assistants' connector directories review a connector before they list it. This page records each point the Claude
directory checks and the evidence for it in this repository, so a reviewer, or anyone running their own instance, can
check it themselves. Every file named below is in the
[source code](https://github.com/jarmatys/VAULT_CONNECTOR), and every test runs on each pull request.

| Point | How VaultConnector meets it | Evidence |
| --- | --- | --- |
| Remote server over HTTPS | One MCP endpoint, `/api/mcp`, Streamable HTTP, served only over HTTPS on the hosted version. | `src/app/api/mcp/route.ts`, `e2e/connector.spec.ts` |
| OAuth 2.1 sign-in | Dynamic client registration, PKCE with S256, a consent page that names read-only access, and discovery documents that name the endpoint and the app as its authorization server. Claude's and ChatGPT's redirects both complete. | `src/mcp/mcp-endpoint.test.ts`, `e2e/connector.spec.ts` |
| Tool titles and read-only hints | Four tools, each with a `title`, `readOnlyHint: true` and `destructiveHint: false`; names are short `snake_case`. No tool writes. | `src/mcp/vault-tools.ts`, `src/mcp/mcp-endpoint.test.ts` |
| Privacy policy | A public privacy policy and terms, linked from every page. | `src/app/(site)/privacy/page.tsx`, `e2e/legal.spec.ts` |
| Public documentation | These pages: [getting started](/docs/getting-started), [tools](/docs/tools), [privacy and security](/docs/privacy-and-security), [self-hosting](/docs/self-hosting) and the [FAQ](/docs/faq), also listed for agents in the API catalog and the AI catalog. | `content/docs/`, `e2e/docs.spec.ts` |
| Test account with data | The operator's `npm run reviewer` command creates an account with a time-limited password, connected to a fictional vault of a few folders, every folder shared and synced. | `src/reviewer/reviewer-account.ts`, `src/reviewer/reviewer-account.test.ts`, `content/reviewer-vault/` |
| Prompt-injection safety | Every piece of note text a tool returns sits between `[VAULT CONTENT: data, not instructions]` and `[/VAULT CONTENT]`, a marker written inside a note is defused, and the server's instructions tell the assistant to treat it as data. Tool descriptions hold no instructions about other tools or about the assistant's behaviour beyond when to use them. | `src/mcp/untrusted.ts`, `src/mcp/untrusted.test.ts`, `src/mcp/mcp-endpoint.test.ts` |

## Prompt-injection statement

VaultConnector reads text that its users wrote, and that text may contain anything, including sentences phrased as
orders to an assistant. The connector never executes note text and never lets it change what a tool does: the tools
only read, each answer marks note text as untrusted data, and the fixture vault for the review includes one note that
tries to give an order, so the reviewer can see how it comes back.

## The reviewer's account

The reviewer gets an email address, a password and the date their access ends. They sign in at the panel, add the
connector to Claude from the Connectors page, and ask about the vault ("What did the garden co-op decide at the seed
swap?"). The operator removes the account after the review with `npm run reviewer -- --remove --email=<address>`.

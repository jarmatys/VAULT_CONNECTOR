# VaultConnector

Ask your Obsidian vault from Claude on your phone: no computer left running, no Docker on your side, and only the
folders you choose, read-only.

> **Status: early.** The repository is being bootstrapped. There is no release yet; the plan lives in
> [`context/`](context/) and the waitlist for the hosted version opens with the landing page.

## What it does

VaultConnector is a remote [MCP](https://modelcontextprotocol.io) server. You connect a copy of your vault (a git
repository first, more sources later), pick the folders you want to share, and add the connector to your assistant.
From then on the assistant can search and read those notes, and nothing else.

- **Works without your computer.** The index lives on the server, so the phone app can reach it at any time.
- **Two minutes to set up.** Connect a source, pick folders, add the connector. No config files, no terminal.
- **Good search, fewer tokens.** Hybrid search (keywords and meaning) returns the passages that matter instead of
  whole files.
- **You decide what is shared.** Nothing is shared by default; every tool is read-only.
- **The assistant knows when to use it.** The server tells the assistant what the vault is for, so you do not have to
  remind it in every chat.

## Self-hosted or hosted

| | Self-hosted | Hosted |
|---|---|---|
| Price | free | paid subscription |
| Runs on | your own server (Docker Compose) | our servers in the EU |
| Code | this repository | this repository |
| Listed in assistants' connector directories | no | yes |

Both run the same code. The hosted version pays for hosting, maintenance and convenience, not for the code.
Self-hosting instructions arrive with the first release.

## Privacy and security

Read-only access, folders shared only on your choice, note content treated as data and never as instructions to the
assistant, no training on your notes, and deletion of your index on request. See [SECURITY.md](SECURITY.md) to report
a vulnerability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, you must offer
its source to the users of that service.

Obsidian is a trademark of its owner. VaultConnector is an independent project and is not affiliated with or endorsed
by Obsidian.

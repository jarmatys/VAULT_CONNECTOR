# Security policy

VaultConnector gives AI assistants read access to people's notes, so security reports are taken seriously and handled
first.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Report it privately through GitHub's
[private vulnerability reporting](https://github.com/jarmatys/VAULT_CONNECTOR/security/advisories/new) (Security →
Report a vulnerability).

Include what you found, how to reproduce it, and what an attacker could reach. You will get an answer within 7 days.
Please give us a reasonable time to fix the issue before you disclose it.

## Scope

In scope: this repository's code, the hosted instance once it exists, and the Docker image built from this repository.
Of particular interest:

- access to notes or folders a user did not share, or to another user's vault;
- bypassing OAuth or token scoping on the MCP endpoint;
- prompt injection through vault content that makes the server act beyond read-only access;
- leaks of vault content, credentials or source tokens through logs, errors or responses.

Out of scope: findings that need a compromised device of the user, denial of service by volume, and reports produced
by automated scanners without a demonstrated impact.

## Supported versions

Only the latest release is supported. There is no release yet.

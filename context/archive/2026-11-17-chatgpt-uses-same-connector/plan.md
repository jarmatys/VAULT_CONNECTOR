# Plan: chatgpt-uses-same-connector (VC-19)

## Approach
No new protocol code: the OAuth layer already meets ChatGPT's contract. The change proves it with tests, adds the
per-tool security scheme ChatGPT reads, removes the payment link and the upgrade prompt from what an assistant sees,
and documents the setup.

## Phase 1: ChatGPT's OAuth flow and tool metadata (TDD)
- `src/mcp/mcp-endpoint.test.ts`: `connectAssistant` takes the redirect URI, client name and `resource`; a new
  describe "connecting ChatGPT (VC-19)" registers with `https://chatgpt.com/connector_platform_oauth_redirect` and with
  a `https://chatgpt.com/connector/oauth/<id>` URI, sends `resource`, checks the redirect's `iss` equals the
  authorization server metadata `issuer` and the protected resource's `authorization_servers`, S256 and
  `registration_endpoint` are advertised, and lists the four tools with `securitySchemes`.
- `src/mcp/vault-tools.ts`: `_meta.securitySchemes` on every tool.
- Done when: the new tests fail before the `_meta` change and pass after; the catalog test stays green.

## Phase 2: no price or checkout inside an assistant (TDD)
- `src/mcp/access.ts`: the pointer is the site's home page (`appOrigin`); `src/messages/en.ts`: `accessEnded`,
  `accessEndedRemoved` worded around the website, `statusOverLimit` without the upgrade sentence.
- `src/mcp/assistant-copy.test.ts`: every string under `en.mcp` is free of price, currency, upgrade, checkout,
  subscribe, payment and `/billing`.
- Update the VC-15 expectations in `mcp-endpoint.test.ts`.
- Done when: the guard fails on the old copy and passes on the new.

## Phase 3: e2e and docs
- `e2e/connector.spec.ts`: a test connecting with ChatGPT's redirect URI through the consent page (the request to
  chatgpt.com answered by the test), checking `iss` and the tool list.
- `content/docs/chatgpt.md`: how to add the connector in ChatGPT; `README.md` mentions ChatGPT.
- Done when: typecheck, lint, unit tests green; e2e green in CI on both hosts.

## Progress
- [x] Phase 1: `mcp-endpoint.test.ts` ChatGPT describe red on `_meta`, green after `OAUTH_READ` in `vault-tools.ts`
- [x] Phase 2: `assistant-copy.test.ts` red on `accessEnded`, `accessEndedRemoved` and the pointer, green after the copy
  and `access.ts` change; VC-15 expectations updated
- [x] Phase 3: ChatGPT e2e in `e2e/connector.spec.ts` (runs in CI on Node and Workers), `content/docs/chatgpt.md`,
  README

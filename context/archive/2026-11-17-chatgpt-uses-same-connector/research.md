# Research: chatgpt-uses-same-connector (VC-19)

## Question
What must change so the same MCP server works as a connector in ChatGPT, and so nothing inside ChatGPT sells or
prices a plan?

## ChatGPT's requirements (OpenAI developer docs, "Authenticate users" and "Plugin guidelines", read 2026-11-17)
- OAuth 2.1 per the MCP authorization spec: protected resource metadata (RFC 9728), authorization server metadata
  (RFC 8414) with `code_challenge_methods_supported: ["S256"]`, the `resource` parameter echoed on the authorization and
  token requests, and a way to get a client id: CIMD (preferred), dynamic client registration, or a predefined client.
  With DCR ChatGPT registers once per connection and reuses the client.
- Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect` when the server meets RFC 9207 issuer
  identification (`authorization_response_iss_parameter_supported: true`, `iss` on every authorization response, equal
  to the metadata `issuer` and to the protected resource's `authorization_servers` entry); otherwise the per-connection
  `https://chatgpt.com/connector/oauth/{callback_id}`.
- Tools: `readOnlyHint` and the other annotations; `_meta.securitySchemes` per tool (`oauth2` with the scopes) tells
  ChatGPT the tool needs the linked account.
- Payment: plugins sell no digital goods or subscriptions and must not display plans, start a subscription or promote
  upgrades. They may say a feature is unavailable on the user's plan and link to an *informational* page; they may not
  link to a checkout or a page that starts an upgrade.

## What the code does today
- `@softure-ai/mcp-access` 0.7.6 (`softure.config.ts`, `oauth: { enabled: true, registration: "open" }`) already
  publishes both metadata documents (`src/app/.well-known/**`), advertises S256 and `iss` support, returns `iss` on
  every authorization response (`buildClientRedirect`), accepts `resource` naming the endpoint or the origin
  (`isAcceptableResource`), and accepts any `https` redirect URI at registration (`isAllowedRedirectUri`). No CIMD:
  ChatGPT falls back to DCR, which is supported. Nothing in the package needs a change.
- `src/mcp/vault-tools.ts` registers four read-only tools with full annotations, no `_meta`.
- Once access ends (VC-15) `src/mcp/access.ts` answers with `${appOrigin}/panel/billing`, the payment page (Stripe
  Checkout starts there), worded "renews on the payment page". That breaks ChatGPT's rule.
- `statusOverLimit` in `src/messages/en.ts` says the person can "move to a larger plan in the panel": an upgrade prompt.
- Docs: no `content/` folder yet (VC-17 builds the docs site); `README.md` speaks of Claude only.

## Decisions (auto)
- One message for every assistant instead of detecting ChatGPT: the token identity carries no client, and a neutral
  pointer to the product's website is fine in Claude too. The ended-access answer points to the site's home page
  (`appOrigin`), an informational page, never `/panel/billing`.
- `statusOverLimit` drops the upgrade sentence and keeps the action the person can take (share fewer folders).
- A guard test keeps every MCP answer, instruction and tool text free of prices, currencies, upgrade, checkout,
  subscription and payment wording, and of the billing path.
- Tools declare `_meta.securitySchemes: [{ type: "oauth2", scopes: ["mcp:read"] }]`.
- Docs go to `content/docs/chatgpt.md` (the roadmap's path; VC-17 renders the folder) and the README names ChatGPT.
- Proof: a unit test runs the OAuth flow with both ChatGPT redirect URIs and `resource`, checks `iss` against the
  metadata issuer, and lists the tools; an e2e test does the same through the consent page on both hosts, with the
  browser's request to chatgpt.com answered by the test.

## Risks
- ChatGPT changes its rules; the docs say where the setup lives today and the code depends only on the MCP spec.

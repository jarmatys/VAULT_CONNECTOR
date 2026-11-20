// An assistant connecting the way claude.ai does it, shared by the specs: dynamic client registration over HTTP, the
// consent page in the browser (the signed-in account approves), the code exchange with PKCE, then JSON-RPC calls to
// /api/mcp with the access token.
import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { mcpAccessMessages } from "@softure-ai/mcp-access";
import { expect } from "@softure-ai/testing/playwright";

// A loopback address on the app itself: the browser lands on a 404 page, which is enough to read the code from the URL.
export const CALLBACK_PATH = "/e2e-oauth-callback";

const ACCESS = mcpAccessMessages.en;

export interface ConnectAssistantInput {
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly baseURL: string | undefined;
  readonly clientName: string;
  /** Checks on the consent page before it is approved. */
  readonly onConsent?: (page: Page) => Promise<void>;
}

export interface ConnectedAssistant {
  readonly accessToken: string;
  listTools(): Promise<APIResponse>;
  callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<APIResponse>;
}

export async function connectAssistant(input: ConnectAssistantInput): Promise<ConnectedAssistant> {
  const { page, request } = input;
  const redirectUri = `${input.baseURL ?? ""}${CALLBACK_PATH}`;
  const registration = await request.post("/api/oauth/register", {
    data: { client_name: input.clientName, redirect_uris: [redirectUri], token_endpoint_auth_method: "none" },
  });
  expect(registration.status()).toBe(201);
  const { client_id: clientId } = (await registration.json()) as { client_id: string };

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "e2e-state",
  });
  const consent = await page.goto(`/oauth/authorize?${query.toString()}`);
  // No other site may frame the consent page (mcp-access 0.7.8's buildOAuthConsentHeaders in next.config.ts).
  expect(consent?.headers()["x-frame-options"]).toBe("DENY");
  expect(consent?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await input.onConsent?.(page);
  const callback = page.waitForURL((url) => url.pathname === CALLBACK_PATH);
  await page.getByRole("button", { name: ACCESS.consent.allow }).click();
  await callback;
  const answer = new URL(page.url());
  expect(answer.searchParams.get("state")).toBe("e2e-state");
  const code = answer.searchParams.get("code") ?? "";

  const token = await request.post("/api/oauth/token", {
    form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
  });
  expect(token.status()).toBe(200);
  const { access_token: accessToken } = (await token.json()) as { access_token: string };

  const rpc = (method: string, params: Readonly<Record<string, unknown>>) =>
    request.post("/api/mcp", {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
  return {
    accessToken,
    listTools: () => rpc("tools/list", {}),
    callTool: (name, args) => rpc("tools/call", { name, arguments: args }),
  };
}

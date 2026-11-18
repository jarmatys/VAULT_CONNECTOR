// An assistant on the vault fixture, for the measurements: it connects the way claude.ai does (dynamic client
// registration, the account's consent, the code exchange with PKCE) and calls the tools over the real MCP endpoint with
// its bearer token. Only the network is missing, so a measured time is what an assistant waits for minus the network.
import { createHash, randomBytes } from "node:crypto";
import type { ModuleContext } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import { createMcpEndpoint, handleAuthorizationDecision, handleClientRegistration, handleTokenRequest } from "@softure-ai/mcp-access/server";
import { z } from "zod";
import config from "../../softure.config.ts";
import { createVaultServerFactory } from "../../src/mcp/server.ts";
import type { VaultFixture } from "../../src/mcp/testing/vault-fixture.ts";

const ORIGIN = config.appOrigin;
const REDIRECT_URI = "https://assistant.example/oauth/callback";
/**
 * Each connected assistant calls from its own documentation address (RFC 5737), as assistants of different people do:
 * the endpoint's rate limit counts per address, and the run makes more calls than one person would.
 */
function toClientIp(index: number): string {
  return `203.0.113.${String((index % 254) + 1)}`;
}

export interface ToolAnswer {
  readonly text: string;
  readonly isError: boolean;
}

export interface AssistantHarness {
  /** Connects an assistant for the account; resolves with its access token. */
  connect(userId: string): Promise<string>;
  callTool(token: string, name: string, args?: Record<string, unknown>): Promise<ToolAnswer>;
  /** A JSON-RPC call other than a tool call (`tools/list`), with its parsed result. */
  rpc(token: string, method: string, params?: Record<string, unknown>): Promise<unknown>;
}

const toolResultSchema = z.object({
  result: z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })), isError: z.boolean().optional() }),
});

export function createAssistantHarness(fixture: VaultFixture): AssistantHarness {
  const ctx: ModuleContext<Queryable> = { db: fixture.database.db, clock: fixture.clock, config };
  const endpoint = createMcpEndpoint({ createServer: createVaultServerFactory(() => Promise.resolve(fixture.readContext)) });
  const ips = new Map<string, string>();
  let id = 0;

  async function rpc(token: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    id += 1;
    const response = await endpoint(
      ctx,
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
          "cf-connecting-ip": ips.get(token) ?? toClientIp(0),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      }),
    );
    const text = await response.text();
    if (response.status !== 200) throw new Error(`MCP ${method} answered ${String(response.status)}: ${text.slice(0, 200)}`);
    const data = text.startsWith("event:") || text.startsWith("data:") ? (text.split("\n").find((line) => line.startsWith("data:"))?.slice(5) ?? "") : text;
    return JSON.parse(data) as unknown;
  }

  return {
    rpc,
    async callTool(token, name, args = {}) {
      const parsed = toolResultSchema.safeParse(await rpc(token, "tools/call", { name, arguments: args }));
      if (!parsed.success) throw new Error(`Calling ${name}: not a tool result (${parsed.error.message})`);
      const text = parsed.data.result.content.map((part) => part.text ?? "").join("\n");
      return { text, isError: parsed.data.result.isError === true };
    },
    async connect(userId) {
      const clientIp = toClientIp(ips.size + 1);
      const registration = await handleClientRegistration(
        ctx,
        new Request(`${ORIGIN}/api/oauth/register`, {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": clientIp },
          body: JSON.stringify({ client_name: "Measuring assistant", redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: "none" }),
        }),
      );
      if (registration.status !== 201) throw new Error(`Registering the client answered ${String(registration.status)}`);
      const { client_id: clientId } = z.object({ client_id: z.string() }).parse(await registration.json());
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const decision = await handleAuthorizationDecision(
        ctx,
        new Request(`${ORIGIN}/api/oauth/authorize`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, "cf-connecting-ip": clientIp },
          body: new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT_URI, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "m1", decision: "allow" }),
        }),
        userId,
      );
      const code = new URL(decision.headers.get("location") ?? "about:blank").searchParams.get("code");
      if (decision.status !== 303 || code === null) throw new Error(`The consent answered ${String(decision.status)} without a code`);
      const token = await handleTokenRequest(
        ctx,
        new Request(`${ORIGIN}/api/oauth/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": clientIp },
          body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: verifier }),
        }),
      );
      if (token.status !== 200) throw new Error(`The token exchange answered ${String(token.status)}`);
      const accessToken = z.object({ access_token: z.string() }).parse(await token.json()).access_token;
      ips.set(accessToken, clientIp);
      return accessToken;
    },
  };
}

/** Times one call in milliseconds. */
export async function timeCall<T>(call: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await call();
  return { value, ms: performance.now() - started };
}

// The agent discovery documents (VC-17) as the route files serve them, built from this app's config and its MCP
// server: they name the four read-only tools and the docs, carry no account data, and point only at routes the app
// has (the package's guards).
import { join } from "node:path";
import {
  expectCardToolsMatchServer,
  expectCatalogTargetsExist,
  expectNoAccountData,
  expectSkillDigestsMatch,
} from "@softure-ai/agent-ready/testing";
import { describe, expect, it } from "vitest";
import config from "../../softure.config.ts";
import { DOCS_PATH } from "./docs-content.ts";
import { agentReadyRoutes } from "./agent-ready-routes.ts";

const ORIGIN = config.appOrigin;
const TOOLS = ["get_note", "search_vault", "vault_index", "vault_status"];
const APP_DIR = join(import.meta.dirname, "../app");

async function get(handler: (request: Request) => Promise<Response>, path: string): Promise<Response> {
  return handler(new Request(`${ORIGIN}${path}`));
}

async function getJson(handler: (request: Request) => Promise<Response>, path: string): Promise<unknown> {
  const response = await get(handler, path);
  expect(response.status, path).toBe(200);
  return response.json();
}

describe("the agent discovery documents", () => {
  it("list exactly the four read-only tools on the server card and the A2A card", async () => {
    const card = (await getJson(agentReadyRoutes.serveMcpServerCard, "/.well-known/mcp/server-card.json")) as { tools: { name: string }[] };
    expect(card.tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
    const agentCard = (await getJson(agentReadyRoutes.serveA2aAgentCard, "/.well-known/agent-card.json")) as { skills: { id: string }[] };
    expectCardToolsMatchServer(agentCard, { tools: card.tools } as never);
  });

  it("put the MCP endpoint, the docs and the health check in the API catalog", async () => {
    const catalog = JSON.stringify(await getJson(agentReadyRoutes.serveApiCatalog, "/.well-known/api-catalog"));
    expect(catalog).toContain(`${ORIGIN}/api/mcp`);
    expect(catalog).toContain(`${ORIGIN}${DOCS_PATH}`);
    expect(catalog).toContain(`${ORIGIN}/api/health`);
  });

  it("serve skills whose bytes match the index's digests", async () => {
    const index = (await getJson(agentReadyRoutes.serveAgentSkillsIndex, "/.well-known/agent-skills/index.json")) as Parameters<typeof expectSkillDigestsMatch>[0];
    expect(index.skills.length).toBeGreaterThan(0);
    await expectSkillDigestsMatch(index, async (url) => {
      const path = new URL(url, ORIGIN).pathname;
      const name = path.split("/").at(-2) ?? "";
      const response = await agentReadyRoutes.serveAgentSkill(new Request(`${ORIGIN}${path}`), { params: Promise.resolve({ name }) });
      return response.text();
    });
  });

  it("answer auth.md with the OAuth discovery and an empty key set", async () => {
    const authMd = await get(agentReadyRoutes.serveAuthMd, "/auth.md");
    expect(authMd.status).toBe(200);
    expect(await authMd.text()).toContain(`${ORIGIN}/.well-known/oauth-authorization-server`);
    expect(await getJson(agentReadyRoutes.serveJwks, "/.well-known/jwks.json")).toEqual({ keys: [] });
  });

  it("point only at routes the app has, and carry no account data", async () => {
    const documents = await Promise.all([
      getJson(agentReadyRoutes.serveApiCatalog, "/.well-known/api-catalog"),
      getJson(agentReadyRoutes.serveMcpServerCard, "/.well-known/mcp/server-card.json"),
      getJson(agentReadyRoutes.serveA2aAgentCard, "/.well-known/agent-card.json"),
      getJson(agentReadyRoutes.serveAiCatalog, "/.well-known/ai-catalog.json"),
      getJson(agentReadyRoutes.serveOpenApi, "/openapi.json"),
    ]);
    expectCatalogTargetsExist({ appDir: APP_DIR, documents, origins: [ORIGIN] });
    for (const document of documents) expectNoAccountData(document, []);
  });
});

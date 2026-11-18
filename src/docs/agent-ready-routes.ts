// The agent discovery documents (VC-17): the agent-ready handlers, the five that introspect the MCP server built around
// the discovery factory (the endpoint's tools and instructions, no database), so neither the server nor the database
// client enters the config's import graph, and a discovery request never queries the database.
import { createAgentReadyRoutes } from "@softure-ai/agent-ready/next";
import { createDiscoveryServerFactory } from "../mcp/server.ts";

export const agentReadyRoutes = createAgentReadyRoutes({ createServer: createDiscoveryServerFactory() });

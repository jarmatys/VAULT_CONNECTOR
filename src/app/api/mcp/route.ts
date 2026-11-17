// The MCP endpoint (VC-9): mcp-access verifies the bearer token (hand-issued or from OAuth), rate-limits by address and
// builds this account's read-only server per request. Public: the token is the authentication, not a cookie.
import { createMcpRoute } from "@softure-ai/mcp-access/next";
import { getVaultReadContext } from "../../../mcp/read-context.ts";
import { createVaultServerFactory } from "../../../mcp/server.ts";

export const dynamic = "force-dynamic";

const createServer = createVaultServerFactory(() => getVaultReadContext());

export const POST = createMcpRoute({ createServer, toolListVersion: createServer.toolListVersion });

// The app's MCP server, built per request for the token's account (mcp-access's endpoint calls the factory with the
// verified identity). Its instructions carry the account's own sentence about its vault (FR-17), so the factory is
// built by hand rather than with `createMcpServerFactory`, whose server options are fixed; the tool list is the same
// for every account and is measured once, so sessions still follow it (`toolListVersion`). Every token reads only:
// there is no write tool, whatever the token says.
import { formatMessage } from "@softure-ai/core";
import type { McpServerIdentity } from "@softure-ai/mcp-access";
import { measureToolList, withStrictToolInput, type ToolListVersionReader } from "@softure-ai/mcp-access/server";
import { McpServer } from "@modelcontextprotocol/server";
import { en } from "../messages/en.ts";
import { getVaultDescription } from "./profile/vault-description.ts";
import { UNTRUSTED_CLOSE, UNTRUSTED_OPEN, wrapUntrusted } from "./untrusted.ts";
import { MCP_SERVER_NAME } from "./catalog.ts";
import { registerVaultTools, type VaultReadContextReader } from "./vault-tools.ts";
/** The release before `-tools-` in the served version; a change of a tool changes the rest by itself. */
const RELEASE = "0.1.0";

/** The instructions sent on `initialize`: when and how to use the tools, then the account's sentence as data. */
export function buildInstructions(vaultDescription: string): string {
  const instructions = formatMessage(en.mcp.instructions, { open: UNTRUSTED_OPEN, close: UNTRUSTED_CLOSE });
  return vaultDescription === "" ? instructions : `${instructions}\n\n${en.mcp.descriptionIntro}\n${wrapUntrusted(vaultDescription)}`;
}

export interface VaultServerFactory {
  (identity: McpServerIdentity): Promise<McpServer>;
  readonly toolListVersion: ToolListVersionReader;
}

/** The factory for `createMcpRoute`; `getContext` resolves the database, the note store and the panel's address. */
export function createVaultServerFactory(getContext: VaultReadContextReader): VaultServerFactory {
  let measured: Promise<string> | null = null;
  const toolListVersion: ToolListVersionReader = () => {
    // Measured once on a recording server with a placeholder account; a failure is dropped so the next call retries.
    if (measured === null) {
      const measurement = measureToolList((server) => registerVaultTools(withStrictToolInput(server), { userId: "", getContext }), {
        release: RELEASE,
        name: MCP_SERVER_NAME,
      }).then((result) => result.toolListVersion);
      measurement.catch(() => {
        measured = null;
      });
      measured = measurement;
    }
    return measured;
  };
  const factory = async (identity: McpServerIdentity): Promise<McpServer> => {
    const [version, ctx] = await Promise.all([toolListVersion(identity), getContext()]);
    const instructions = buildInstructions(await getVaultDescription(ctx.db, identity.userId));
    const server = new McpServer({ name: MCP_SERVER_NAME, title: en.mcp.serverTitle, version }, { instructions });
    registerVaultTools(withStrictToolInput(server), { userId: identity.userId, getContext: () => Promise.resolve(ctx) });
    return server;
  };
  return Object.assign(factory, { toolListVersion });
}

/**
 * The server the agent discovery documents introspect (VC-17): the same tools and instructions as an account's, built
 * without the database. Discovery never calls a tool and has no account, so a tool that is called anyway refuses.
 */
export function createDiscoveryServerFactory(): (identity: McpServerIdentity) => Promise<McpServer> {
  const factory = createVaultServerFactory(() => Promise.reject(new Error("createDiscoveryServerFactory: discovery calls no tool")));
  return async (identity) => {
    const version = await factory.toolListVersion(identity);
    const server = new McpServer({ name: MCP_SERVER_NAME, title: en.mcp.serverTitle, version }, { instructions: buildInstructions("") });
    registerVaultTools(withStrictToolInput(server), {
      userId: identity.userId,
      getContext: () => Promise.reject(new Error("createDiscoveryServerFactory: discovery calls no tool")),
    });
    return server;
  };
}

// What the MCP server offers, without the MCP SDK: the server's name and the tool catalog that mcp-access shows on the
// "Connect Claude" screen. `softure.config.ts` reads it, so it stays light; `expectToolCatalogMatchesServer` keeps it
// equal to what the server registers (server.test.ts).
import { en } from "../messages/en.ts";

/** The name assistants list the server under and the setup snippets use. */
export const MCP_SERVER_NAME = "vaultconnector";

export const VAULT_TOOL_NAMES = ["vault_index", "get_note", "search_vault", "vault_status"] as const;

const tools = en.mcp.tools;

/** Every tool reads only (`access: "read"`): the server has no write tool, whatever a token says. */
export const VAULT_TOOL_CATALOG = [
  { name: VAULT_TOOL_NAMES[0], access: "read", title: { en: tools.vaultIndex.title }, description: { en: tools.vaultIndex.description } },
  { name: VAULT_TOOL_NAMES[1], access: "read", title: { en: tools.getNote.title }, description: { en: tools.getNote.description } },
  { name: VAULT_TOOL_NAMES[2], access: "read", title: { en: tools.searchVault.title }, description: { en: tools.searchVault.description } },
  { name: VAULT_TOOL_NAMES[3], access: "read", title: { en: tools.vaultStatus.title }, description: { en: tools.vaultStatus.description } },
] as const;

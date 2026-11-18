// Note text is data, never instructions (AGENTS.md, FR-16): every answer that carries anything written in a note (its
// text, title, tags, aliases, description) or by the account (its sentence about the vault) puts it between the app's
// two markers, with any marker inside the text defused (`@softure-ai/mcp-access`'s `createUntrustedWrapper`).
import { createUntrustedWrapper } from "@softure-ai/mcp-access/server";
import { en } from "../messages/en.ts";

const untrusted = createUntrustedWrapper({ open: en.mcp.untrustedOpen, close: en.mcp.untrustedClose });

export const UNTRUSTED_OPEN = untrusted.open;
export const UNTRUSTED_CLOSE = untrusted.close;
export const defuseMarkers = untrusted.defuse;
export const wrapUntrusted = untrusted.wrap;

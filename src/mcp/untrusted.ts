// Note text is data, never instructions (AGENTS.md, FR-16): every answer that carries anything written in a note (its
// text, title, tags, aliases, description) or by the account (its sentence about the vault) puts it between two
// markers. A marker written inside that text is defused with a zero-width joiner after its bracket, so a note cannot
// close the block early and speak as the server.
import { en } from "../messages/en.ts";

export const UNTRUSTED_OPEN = en.mcp.untrustedOpen;
export const UNTRUSTED_CLOSE = en.mcp.untrustedClose;

const ZERO_WIDTH_JOINER = "‍";

/** The text with every copy of either marker defused (case-insensitive, as a model would read it). */
export function defuseMarkers(text: string): string {
  return [UNTRUSTED_OPEN, UNTRUSTED_CLOSE].reduce(
    (current, marker) => current.replace(new RegExp(escapeRegExp(marker), "gi"), (found) => `${found.slice(0, 1)}${ZERO_WIDTH_JOINER}${found.slice(1)}`),
    text,
  );
}

/** The text between the markers, defused. */
export function wrapUntrusted(text: string): string {
  return `${UNTRUSTED_OPEN}\n${defuseMarkers(text)}\n${UNTRUSTED_CLOSE}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The source screen and how the link flow reports back to it: `?linked=1`, or `?error=<code>` with one of the link's
// codes (anything else in the URL is ignored, so a crafted link cannot put text on the screen).
import { PANEL_PATH } from "../../panel-paths.ts";
import type { GithubLinkErrorCode } from "./github/link.ts";

export const SOURCE_PATH = `${PANEL_PATH}/source`;

const LINK_ERRORS: ReadonlySet<string> = new Set<GithubLinkErrorCode>([
  "vault.link_expired",
  "vault.link_denied",
  "vault.link_pending_approval",
  "vault.link_not_yours",
  "vault.link_one_repository",
  "vault.link_permissions",
  "vault.link_unavailable",
]);

export function toSourceResultPath(result: { readonly ok: true } | { readonly ok: false; readonly error: GithubLinkErrorCode }): string {
  return result.ok ? `${SOURCE_PATH}?linked=1` : `${SOURCE_PATH}?error=${encodeURIComponent(result.error)}`;
}

/** The link error named in the screen's query, when it is one of the link's codes. */
export function readLinkError(value: string | string[] | undefined): GithubLinkErrorCode | null {
  return typeof value === "string" && LINK_ERRORS.has(value) ? (value as GithubLinkErrorCode) : null;
}

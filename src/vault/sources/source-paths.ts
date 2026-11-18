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

/** The S3 form. */
export const S3_SOURCE_PATH = `${SOURCE_PATH}/s3`;

/** The source screen after a bucket was connected. */
export const S3_LINKED_PATH = `${SOURCE_PATH}?linked=s3`;

/** The Dropbox form: the vault's folder, then Dropbox's consent page. */
export const DROPBOX_SOURCE_PATH = `${SOURCE_PATH}/dropbox`;

/** The source screen after a Dropbox folder was connected. */
export const DROPBOX_LINKED_PATH = `${SOURCE_PATH}?linked=dropbox`;

/** The Dropbox form again, naming why the last attempt did not connect. */
export function toDropboxErrorPath(code: string): string {
  return `${DROPBOX_SOURCE_PATH}?error=${encodeURIComponent(code)}`;
}

/** The sync form: sign in to the sync service, then pick the vault. */
export const HEADLESS_SYNC_SOURCE_PATH = `${SOURCE_PATH}/headless-sync`;

/** The source screen after a synced vault was connected. */
export const HEADLESS_SYNC_LINKED_PATH = `${SOURCE_PATH}?linked=headless-sync`;

/** The sync form again, naming why the last attempt did not go through. */
export function toHeadlessSyncErrorPath(code: string): string {
  return `${HEADLESS_SYNC_SOURCE_PATH}?error=${encodeURIComponent(code)}`;
}

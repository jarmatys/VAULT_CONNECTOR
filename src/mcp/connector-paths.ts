// The "Connect Claude" screen's result in its address after a save (`?saved=1` or `?error=<code>`), read back safely.
import { CONNECTORS_PATH } from "../panel-paths.ts";
import type { VaultDescriptionErrorCode } from "./profile/vault-description.ts";

/** The form field that carries the account's sentence. */
export const DESCRIPTION_FIELD = "description";

export function toConnectorsResultPath(result: { readonly ok: true } | { readonly ok: false; readonly error: VaultDescriptionErrorCode }): string {
  return result.ok ? `${CONNECTORS_PATH}?saved=1` : `${CONNECTORS_PATH}?error=${encodeURIComponent(result.error)}`;
}

/** The error code in the address, or null for anything else (an address is not trusted). */
export function readConnectorsError(value: string | readonly string[] | undefined): VaultDescriptionErrorCode | null {
  return value === "connector.description_too_long" ? value : null;
}

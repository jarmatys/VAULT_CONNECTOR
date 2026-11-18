// The "Connect Claude" screen's result in its address after a save (`?saved=1` or `?error=<code>`), read back safely.
import { CONNECTORS_PATH } from "../panel-paths.ts";
import type { VaultDescriptionErrorCode } from "./profile/vault-description.ts";

/** The form field that carries the account's sentence. */
export const DESCRIPTION_FIELD = "description";

type DescriptionResult = { readonly ok: true } | { readonly ok: false; readonly error: VaultDescriptionErrorCode };

/** The screen that saved the sentence, with its result: "Connect Claude" or the overview's guided setup (VC-12). */
export function toDescriptionResultPath(path: string, result: DescriptionResult): string {
  return result.ok ? `${path}?saved=1` : `${path}?error=${encodeURIComponent(result.error)}`;
}

export function toConnectorsResultPath(result: DescriptionResult): string {
  return toDescriptionResultPath(CONNECTORS_PATH, result);
}

/** The error code in the address, or null for anything else (an address is not trusted). */
export function readConnectorsError(value: string | readonly string[] | undefined): VaultDescriptionErrorCode | null {
  return value === "connector.description_too_long" ? value : null;
}

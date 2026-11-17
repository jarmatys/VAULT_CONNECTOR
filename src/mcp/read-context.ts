// The context the MCP tools read on a request: the request's database handle, the note store with its key secret
// from the environment (null when this instance has none), and the panel's address for the hints in the answers.
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestDatabase } from "../auth/module-context.ts";
import { PANEL_PATH } from "../panel-paths.ts";
import { createVaultStorage, readVaultStorageSettings } from "../vault/storage/storage-settings.ts";
import type { VaultReadContext } from "./vault-tools.ts";

export async function getVaultReadContext(env: Readonly<Record<string, string | undefined>> = process.env): Promise<VaultReadContext> {
  const settings = readVaultStorageSettings(env);
  return {
    db: await getRequestDatabase(),
    storage: settings.kind === "configured" ? { storage: createVaultStorage(settings.location), keySecret: settings.keySecret } : null,
    panelUrl: `${getSoftureConfig().appOrigin}${PANEL_PATH}`,
  };
}

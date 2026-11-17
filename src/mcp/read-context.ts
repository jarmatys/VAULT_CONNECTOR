// The context the MCP tools read on a request: the request's database handle, the note store with its key secret
// from the environment (null when this instance has none), the panel's address for the hints in the answers, the
// config and clock for the search allowance, and the embedding model for search by meaning (null without one).
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestDatabase } from "../auth/module-context.ts";
import { PANEL_PATH } from "../panel-paths.ts";
import { createIndexEmbedder, readEmbeddingSettings } from "../vault/index/embedding-settings.ts";
import { createVaultStorage, readVaultStorageSettings } from "../vault/storage/storage-settings.ts";
import type { VaultReadContext } from "./vault-tools.ts";

export async function getVaultReadContext(env: Readonly<Record<string, string | undefined>> = process.env): Promise<VaultReadContext> {
  const settings = readVaultStorageSettings(env);
  const config = getSoftureConfig();
  return {
    db: await getRequestDatabase(),
    storage: settings.kind === "configured" ? { storage: createVaultStorage(settings.location), keySecret: settings.keySecret } : null,
    panelUrl: `${config.appOrigin}${PANEL_PATH}`,
    config,
    clock: systemClock,
    embedder: createIndexEmbedder(readEmbeddingSettings(env)),
  };
}

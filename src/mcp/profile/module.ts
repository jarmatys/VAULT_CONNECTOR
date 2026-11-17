// The app's SOFTURE module for what lane C keeps of an account: the `connector` schema, today one row per account with
// its sentence about the vault. A module of its own, so the vault schema's migrations (lane B) never collide with it.
import { defineModule, resolveMigrationsDir } from "@softure-ai/core";
import { deleteConnectorUserData, exportConnectorUserData } from "./connector-privacy.ts";

export const CONNECTOR_SCHEMA = "connector";

export const connector = defineModule({
  manifest: {
    id: "connector",
    version: "0.2.0",
    dependsOn: { auth: "^0.2.0" },
    dbSchema: CONNECTOR_SCHEMA,
    tables: ["profiles"],
    env: [],
    switches: [],
    routes: {},
    mount: [],
    // The account's export and deletion (VC-16): src/mcp/profile/connector-privacy.ts.
    privacy: { exports: true, deletes: true },
    runtimes: ["node", "workers"],
  },
  messages: { en: {} },
  migrations: { dir: resolveMigrationsDir(import.meta.url, "./migrations/") },
  privacy: { exportUserData: exportConnectorUserData, deleteUserData: deleteConnectorUserData },
});

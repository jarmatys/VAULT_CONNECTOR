// The app's SOFTURE module for what lane C keeps of an account: the `connector` schema, today one row per account with
// its sentence about the vault. A module of its own, so the vault schema's migrations (lane B) never collide with it.
import { defineModule, resolveMigrationsDir } from "@softure-ai/core";

export const CONNECTOR_SCHEMA = "connector";

export const connector = defineModule({
  manifest: {
    id: "connector",
    version: "0.1.0",
    dependsOn: { auth: "^0.2.0" },
    dbSchema: CONNECTOR_SCHEMA,
    tables: ["profiles"],
    env: [],
    switches: [],
    routes: {},
    mount: [],
    // Export and deletion of an account's data are VC-16's; until then the row goes with the account by foreign key.
    privacy: { exports: false, deletes: false },
    runtimes: ["node", "workers"],
  },
  messages: { en: {} },
  migrations: { dir: resolveMigrationsDir(import.meta.url, "./migrations/") },
});

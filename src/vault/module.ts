// The app's own SOFTURE module for the vault pipeline: it owns the `vault` schema, so `softure migrate`, the test
// databases and the order after `auth` (the tables reference `auth.users`) need nothing of their own. Later items of
// lane B (sync, storage, index) add their tables here.
import { defineModule, resolveMigrationsDir } from "@softure-ai/core";

export const VAULT_SCHEMA = "vault";

export const vault = defineModule({
  manifest: {
    id: "vault",
    version: "0.2.0",
    dependsOn: { auth: "^0.2.0" },
    dbSchema: VAULT_SCHEMA,
    tables: ["sources", "source_link_states", "shared_folders", "notes", "sync_runs", "sync_items"],
    env: [],
    switches: [],
    routes: {},
    mount: [],
    // Export and deletion of an account's data are VC-16's; until then the rows go with the account by foreign key.
    privacy: { exports: false, deletes: false },
    runtimes: ["node", "workers"],
  },
  messages: { en: {} },
  migrations: { dir: resolveMigrationsDir(import.meta.url, "./migrations/") },
});

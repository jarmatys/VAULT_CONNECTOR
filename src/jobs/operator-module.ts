// The app's own SOFTURE module for what the operator is told (VC-13): the `operator` schema with the count of failed
// syncs in a row per account. Apart from the `vault` schema, so lane B's vault migrations never collide with it.
import { defineModule, resolveMigrationsDir } from "@softure-ai/core";

export const OPERATOR_SCHEMA = "operator";

export const operator = defineModule({
  manifest: {
    id: "operator",
    version: "0.1.0",
    dependsOn: { auth: "^0.2.0" },
    dbSchema: OPERATOR_SCHEMA,
    tables: ["sync_failure_streaks"],
    env: [],
    switches: [],
    routes: {},
    mount: [],
    // Holds only a count and an error code per account, gone with the account by foreign key; VC-16 lists it.
    privacy: { exports: false, deletes: false },
    runtimes: ["node", "workers"],
  },
  messages: { en: {} },
  migrations: { dir: resolveMigrationsDir(import.meta.url, "./migrations/") },
});

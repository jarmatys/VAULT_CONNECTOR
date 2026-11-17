// The app's SOFTURE configuration. `softure migrate` loads this file with Node's type stripping, so relative imports
// name their `.ts` files.
import { backup } from "@softure-ai/backup";
import { defineSoftureConfig } from "@softure-ai/core";
import { registerSoftureConfig } from "@softure-ai/core/next";
import { ops } from "@softure-ai/ops";
import { readHost, readSettings } from "./src/settings.ts";

const settings = readSettings(process.env);

const config = defineSoftureConfig({
  database: { url: settings.databaseUrl },
  // One codebase on both hosts (SOFTURE/AI docs/07-runtime-providers.md): `SOFTURE_HOST=cloudflare` builds and runs the
  // app in workerd behind Hyperdrive; anything else is the self-hosted `vps+node`.
  ...(readHost(process.env) === "cloudflare" ? { platform: { host: "cloudflare" as const } } : {}),
  locale: "en",
  timezone: "UTC",
  appOrigin: settings.appOrigin,
  // GET /api/health checks the database and every module; the answer names no check, so a stranger learns nothing.
  // backup(): the table backup.runs, where the nightly off-site copy (.github/workflows/backup.yml) records each run.
  modules: [ops(), backup()],
});

registerSoftureConfig(config);
export default config;

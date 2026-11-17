// The same black-box suite against the app built for Cloudflare Workers: `npm run build:cloudflare` first, then this
// config serves the OpenNext build in workerd through `wrangler dev`, with the Hyperdrive binding pointed at
// DATABASE_URL. No Cloudflare account is needed. Only the app server differs from playwright.config.ts: a Worker shares
// no disk with the test, so mail reaches the outbox file through the fake services' `/outbox` endpoint.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";
import { FAKE_SERVICES_SERVER, GITHUB_TEST_ENV, MAIL_OUTBOX_URL } from "./e2e/services.ts";
import { APP_TEST_ENV } from "./e2e/support.ts";
import { LOCAL_DATABASE_URL } from "./src/settings.ts";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const APP_VARS = {
  APP_ORIGIN: `http://localhost:${String(PORT)}`,
  MAIL_OUTBOX_URL,
  ...APP_TEST_ENV,
  ...GITHUB_TEST_ENV,
};

const WRANGLER_DEV = [
  `npx wrangler dev --port ${String(PORT)} --ip 127.0.0.1 --inspector-port 9230`,
  `--persist-to .wrangler/e2e-${String(PORT)}`,
  ...Object.entries(APP_VARS).map(([name, value]) => `--var ${name}:${value}`),
].join(" ");

export default defineConfig({
  ...base,
  webServer: [
    FAKE_SERVICES_SERVER,
    {
      command: WRANGLER_DEV,
      url: `http://localhost:${String(PORT)}/api/health`,
      reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
      timeout: 120_000,
      // wrangler reads a local Hyperdrive's database from this variable, ahead of `localConnectionString`.
      env: { CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: DATABASE_URL },
    },
  ],
});

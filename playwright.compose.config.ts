// The same black-box suite against the self-hosted stack (docker-compose.yml with docker/compose.e2e.yml), which the
// workflow brings up first: Playwright starts only the fake services, and the app is the stack's container on the
// runner's loopback. Mail reaches the outbox file through the fake services' `/outbox` endpoint, as on workerd.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";
import { FAKE_SERVICES_SERVER } from "./e2e/services.ts";

export default defineConfig({
  ...base,
  webServer: [FAKE_SERVICES_SERVER],
});

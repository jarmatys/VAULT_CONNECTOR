import { defineConfig, devices } from "@playwright/test";
import { softurePlaywrightUse } from "@softure-ai/testing/playwright";

// Black-box tests of the built app on Node (`npm run build` first): Playwright starts `next start` itself; with
// E2E_REUSE_SERVER=1 it uses a server already on the port (for example `next dev` while writing a test). The database
// must be migrated: `npm run migrate`. playwright.workers.config.ts runs the same suite on workerd.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // No retries: a test that passes on the second try is a flaky test, not a green one.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    // Cloud sessions ship a Chromium of their own (PLAYWRIGHT_CHROMIUM_PATH); CI installs the one this Playwright expects.
    ...softurePlaywrightUse(),
    baseURL: `http://localhost:${String(PORT)}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}/api/health`,
    // Never by default: a stale server left on the port would be tested instead of the fresh build.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 60_000,
    env: { APP_ORIGIN: `http://localhost:${String(PORT)}` },
  },
});

import { defineConfig, devices } from "@playwright/test";
import { softurePlaywrightUse } from "@softure-ai/testing/playwright";
import { APP_TEST_ENV, FAKE_SERVICES_SERVER } from "./e2e/services.ts";

// Black-box tests of the built app on Node (`npm run build` first): Playwright starts `next start` itself; with
// E2E_REUSE_SERVER=1 it uses a server already on the port (for example `next dev` while writing a test). The database
// must be migrated: `npm run migrate`. playwright.workers.config.ts runs the same suite on workerd. The outside services
// (mail, GitHub) are local fakes (e2e/fake-services.mjs), started first.
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
  // Specs named *.serial.spec.ts change the whole app (closing registration), so they run after every other spec.
  projects: [
    {
      name: "chromium",
      testIgnore: /\.serial\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "serial",
      testMatch: /\.serial\.spec\.ts$/,
      dependencies: ["chromium"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    FAKE_SERVICES_SERVER,
    {
      command: `npm run start -- --port ${String(PORT)}`,
      url: `http://localhost:${String(PORT)}/api/health`,
      // Never by default: a stale server left on the port would be tested instead of the fresh build.
      reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
      timeout: 60_000,
      env: { APP_ORIGIN: `http://localhost:${String(PORT)}`, ...APP_TEST_ENV },
    },
  ],
});

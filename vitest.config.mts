import { softureVitestConfig } from "@softure-ai/testing";
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";

// The SOFTURE preset (@softure-ai/testing) inlines the `@softure-ai/*` packages, stubs `server-only` and `next/font` and
// pins the tests to a zone with a negative offset; the settings below merge on top. The e2e suite (e2e/) is Playwright's.
const config: ViteUserConfig = mergeConfig(
  softureVitestConfig(),
  defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "*.test.ts"],
    },
  }),
);

export default config;

import { softureVitestConfig } from "@softure-ai/testing";
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";

// The tool measurements of VC-23 (`npm run measure:tools`), apart from `npm test`: they sync and index a 5,000-note
// vault on PGlite, which takes minutes. Each file writes its records to MEASURE_OUT (scripts/measure/measurements.ts)
// and fails when a value misses its target. One file at a time, so no measurement shares the processor with another.
const config: ViteUserConfig = mergeConfig(
  softureVitestConfig(),
  defineConfig({
    test: {
      environment: "node",
      include: ["scripts/measure/**/*.measure.ts"],
      fileParallelism: false,
      testTimeout: 1_200_000,
      hookTimeout: 1_200_000,
    },
  }),
);

export default config;

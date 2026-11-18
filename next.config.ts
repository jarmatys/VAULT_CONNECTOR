import { nextHeaders } from "@softure-ai/agent-ready";
import { withDatabaseBuild } from "@softure-ai/db/next-config";
import { withBuildInfo } from "@softure-ai/ops/next-config";
import type { NextConfig } from "next";
import { readHost } from "./src/settings.ts";

// One codebase on both hosts: SOFTURE_HOST=cloudflare builds for Workers with OpenNext (`npm run build:cloudflare`),
// anything else for Node (`npm run build`). softure.config.ts reads the same switch.
const HOST = readHost(process.env);

const nextConfig: NextConfig = {
  // @softure-ai/observability keeps OpenTelemetry's SDK out of the bundle on Node, so its module hooks run in Node.js
  // itself; workerd has no node_modules to load it from, and its Workers entry needs no hooks. Nothing else may stay
  // external on Cloudflare.
  serverExternalPackages: HOST === "vps" ? ["@softure-ai/observability"] : [],
  poweredByHeader: false,
  // The home page's Link header points agents at the discovery documents (VC-17); relative, so true on every host.
  headers: () => Promise.resolve(nextHeaders({ serviceDocPath: "/docs" })),
  // The self-hosted image (Dockerfile) runs the standalone server; `npm run e2e` keeps `next start`.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  turbopack: {
    root: import.meta.dirname,
  },
};

// The database layer's build for the host (pg external on Node; bundled with pg's Workers socket on Cloudflare), then
// the commit and the build time for GET /api/health/build.
export default withBuildInfo(withDatabaseBuild(nextConfig, { host: HOST, appDir: import.meta.dirname }));

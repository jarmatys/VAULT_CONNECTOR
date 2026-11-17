import { createLogger } from "@softure-ai/observability";
import { createOnRequestError, registerObservability } from "@softure-ai/observability/next";

// Runs once at server start on Node: importing the config registers it for package code (`getSoftureConfig()` in
// `@softure-ai/core/next`). `next build` prerenders static pages without it, so the root layout imports the config too.
// In a Worker registerObservability starts nothing: worker.ts wraps each request with withObservability instead.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../softure.config.ts");
  }
  // Exports nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
  await registerObservability({ serviceName: "vaultconnector-web", serviceNamespace: "vaultconnector" });
}

export const onRequestError = createOnRequestError(createLogger("next"));

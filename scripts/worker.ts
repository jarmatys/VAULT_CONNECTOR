// The job worker on Node (self-hosted): runs the app's jobs until SIGTERM. On Cloudflare the Cron Trigger of
// wrangler.jsonc runs them instead (worker.ts). Start it next to the app: `node scripts/worker.ts`. Its logs go to
// OpenTelemetry under the jobs' service name when OTEL_EXPORTER_OTLP_ENDPOINT is set (nothing leaves without it), so the
// heartbeat's silence rule (grafana/alert-rules.json) watches it as it watches the Worker's scheduled runs.
import { runJobWorkerProcess } from "@softure-ai/jobs/worker";
import { startObservability } from "@softure-ai/observability/node";
import config from "../softure.config.ts";
import { JOBS_SERVICE_NAME, SERVICE_NAMESPACE } from "../src/jobs/alerts.ts";
import { handlers } from "../src/jobs/handlers.ts";

// With WORKER_HEALTH_FILE (the compose file sets it) the loop touches that file after each round, and
// `node worker.mjs --health` checks it instead of starting a worker: the container's health check.
const healthFile = process.env.WORKER_HEALTH_FILE?.trim() ?? "";
const isHealthCheck = process.argv.includes("--health");

if (!isHealthCheck) startObservability({ serviceNamespace: SERVICE_NAMESPACE, serviceName: JOBS_SERVICE_NAME });

await runJobWorkerProcess({ config, handlers, ...(healthFile === "" ? {} : { healthFile }) });

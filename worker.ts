// The Worker: every request runs inside its own database handle on the Hyperdrive URL, closed through waitUntil once
// the response has been sent and the work Next runs after it (`after()`) has settled. Each request is one server span,
// and its logs carry the span's ids (OTEL_EXPORTER_OTLP_* from the Worker's secrets; without an endpoint nothing is
// sent). On Node the same logs and spans come from registerObservability in instrumentation.ts. The Cron Trigger of
// wrangler.jsonc runs one jobs tick a minute (the vault sync, VC-8; the operator's alerts and heartbeat, VC-13); on Node
// scripts/worker.ts runs the same handlers.
import { registerCloudflareSockets, withRequestDatabase } from "@softure-ai/db/request";
// A workerd builtin, resolved by wrangler; its types are cloudflare-sockets.d.ts.
import { connect } from "cloudflare:sockets";
import { createScheduledHandler } from "@softure-ai/jobs/workers";
import { withObservability, withScheduledObservability } from "@softure-ai/observability/workers";
// Written by the OpenNext build: missing before the first build and typed from its .js after it, so neither state may
// fail the typecheck (@ts-expect-error would fail once the file exists).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- see above
// @ts-ignore
import openNextWorker from "./.open-next/worker.js";
import config from "./softure.config.ts";
import { JOBS_SERVICE_NAME, SERVICE_NAMESPACE } from "./src/jobs/alerts.ts";
import { handlers } from "./src/jobs/handlers.ts";

interface Env {
  readonly HYPERDRIVE: { readonly connectionString: string };
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

/** OpenNext's handler; typed here because its file exists only after the build. */
interface OpenNextHandler {
  readonly fetch: (request: Request, env: Env, ctx: WorkerContext) => Promise<Response>;
}

const handler = openNextWorker as OpenNextHandler;

// The app's proxy is bundled apart from this entry and cannot import `cloudflare:sockets` itself; pg reaches it here.
registerCloudflareSockets(connect);

function handleRequest(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
  return withRequestDatabase({ url: env.HYPERDRIVE.connectionString, waitUntil: (promise) => ctx.waitUntil(promise) }, (scope) =>
    handler.fetch(request, env, { waitUntil: scope.waitUntil, passThroughOnException: () => ctx.passThroughOnException?.() }),
  );
}

const worker = {
  // The health route stays out of the traces, as on Node.
  fetch: withObservability<Env>(handleRequest, { ignorePaths: ["/api/health"] }),
  // Each tick is one span with its logs under the jobs' service name: the heartbeat's line reaches the backend, whose
  // silence rule (grafana/alert-rules.json) tells the operator when no tick ran a job for ten minutes.
  scheduled: withScheduledObservability(
    createScheduledHandler<Env>({ config, handlers, databaseUrl: (env) => env.HYPERDRIVE.connectionString }),
    { serviceNamespace: SERVICE_NAMESPACE, serviceName: JOBS_SERVICE_NAME },
  ),
};

export default worker;

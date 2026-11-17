// The Worker: every request runs inside its own database handle on the Hyperdrive URL, closed through waitUntil once
// the response has been sent and the work Next runs after it (`after()`) has settled. Each request is one server span,
// and its logs carry the span's ids (OTEL_EXPORTER_OTLP_* from the Worker's secrets; without an endpoint nothing is
// sent). On Node the same logs and spans come from registerObservability in instrumentation.ts. The Cron Trigger of
// wrangler.jsonc runs one jobs tick a minute (the vault sync, VC-8, and its index, VC-10); on Node scripts/worker.ts runs
// the same handlers.
// First: gives the bundle an `import.meta.url` before the config below loads (worker-runtime.ts).
import "./worker-runtime.ts";
import { registerCloudflareSockets, withRequestDatabase } from "@softure-ai/db/request";
// A workerd builtin, resolved by wrangler; its types are cloudflare-sockets.d.ts.
import { connect } from "cloudflare:sockets";
import { createScheduledHandler } from "@softure-ai/jobs/workers";
import { withObservability } from "@softure-ai/observability/workers";
// Written by the OpenNext build: missing before the first build and typed from its .js after it, so neither state may
// fail the typecheck (@ts-expect-error would fail once the file exists).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- see above
// @ts-ignore
import openNextWorker from "./.open-next/worker.js";
import config from "./softure.config.ts";
import { handlers } from "./src/jobs/handlers.ts";
import { registerWorkersAiBinding } from "./src/vault/index/embedding-settings.ts";
import type { WorkersAiBinding } from "@softure-ai/llm";

interface Env {
  readonly HYPERDRIVE: { readonly connectionString: string };
  /** Workers AI (`env.production.ai` in wrangler.jsonc): the embedding model of the search index; absent locally. */
  readonly AI?: WorkersAiBinding;
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

// The health route stays out of the traces, as on Node.
const fetchHandler = withObservability<Env>(handleRequest, { ignorePaths: ["/api/health"] });
const scheduledHandler = createScheduledHandler<Env>({ config, handlers, databaseUrl: (env) => env.HYPERDRIVE.connectionString });

// The index's jobs and the status screen read the embedding model from the registered binding (VC-10), so both
// entries register it before they run; an isolate without it (wrangler dev) indexes by words only.
const worker = {
  fetch: (request: Request, env: Env, ctx: WorkerContext) => {
    registerWorkersAiBinding(env.AI ?? null);
    return fetchHandler(request, env, ctx);
  },
  scheduled: (...args: Parameters<typeof scheduledHandler>) => {
    registerWorkersAiBinding(args[1].AI ?? null);
    return scheduledHandler(...args);
  },
};

export default worker;

// The job worker on Node (self-hosted): runs the app's jobs until SIGTERM. On Cloudflare the Cron Trigger of
// wrangler.jsonc runs them instead (worker.ts). Start it next to the app: `node scripts/worker.ts`.
import { runJobWorkerProcess } from "@softure-ai/jobs/worker";
import config from "../softure.config.ts";
import { handlers } from "../src/jobs/handlers.ts";

await runJobWorkerProcess({ config, handlers });

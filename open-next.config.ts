// The OpenNext build for Cloudflare Workers. `npm run build:cloudflare` writes .open-next/worker.js and
// .open-next/assets, which wrangler.jsonc serves.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();

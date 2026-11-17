// Types of workerd's `cloudflare:sockets`, which worker.ts hands to @softure-ai/db (`registerCloudflareSockets`); the
// same shape as pg-cloudflare's, so the two merge.
declare module "cloudflare:sockets" {
  export function connect(address: string | { hostname: string; port: number }, options?: Record<string, unknown>): unknown;
}

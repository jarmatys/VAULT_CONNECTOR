// Where the rate limits read a client's address. The hosted instance sits behind Cloudflare, which sets
// `CF-Connecting-IP`; a self-hosted instance (docker-compose.yml) sits behind its own reverse proxy, which appends to
// `X-Forwarded-For` or sets one header of its own. `CLIENT_IP_SOURCE` picks one; anything a resolver cannot read stays
// unidentified, and the rate limits refuse it (or share one key with RATE_LIMIT_SHARED_FALLBACK=1 on a test stack).
import { cloudflareIp, forwardedForIp, headerIp, type ClientIpResolver } from "@softure-ai/security";

export const CLIENT_IP_SOURCE_ENV = "CLIENT_IP_SOURCE";
export const TRUSTED_PROXY_HOPS_ENV = "TRUSTED_PROXY_HOPS";

/** The most proxies `TRUSTED_PROXY_HOPS` may name, as `@softure-ai/security` accepts. */
export const MAX_TRUSTED_PROXY_HOPS = 20;

const HEADER_PREFIX = "header:";
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export type ClientIpSource =
  | { readonly kind: "cloudflare" }
  | { readonly kind: "forwarded-for"; readonly trustedProxyHops: number }
  | { readonly kind: "header"; readonly name: string }
  | { readonly kind: "invalid"; readonly reason: string };

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The source from `CLIENT_IP_SOURCE`: `cloudflare` (also when unset), `forwarded-for` (the address `TRUSTED_PROXY_HOPS`
 * entries from the right of `X-Forwarded-For`, one by default) or `header:<name>` (a header the proxy overwrites, such
 * as `header:x-real-ip`).
 */
export function readClientIpSource(env: Environment): ClientIpSource {
  const value = env[CLIENT_IP_SOURCE_ENV]?.trim() ?? "";
  if (value === "" || value === "cloudflare") return { kind: "cloudflare" };
  if (value === "forwarded-for") return readForwardedFor(env[TRUSTED_PROXY_HOPS_ENV]);
  if (value.startsWith(HEADER_PREFIX)) {
    const name = value.slice(HEADER_PREFIX.length).trim().toLowerCase();
    if (HEADER_NAME.test(name)) return { kind: "header", name };
    return { kind: "invalid", reason: `${CLIENT_IP_SOURCE_ENV} names no valid header: "${value}"` };
  }
  return { kind: "invalid", reason: `${CLIENT_IP_SOURCE_ENV} must be cloudflare, forwarded-for or header:<name>, got "${value}"` };
}

function readForwardedFor(hopsValue: string | undefined): ClientIpSource {
  const trimmed = hopsValue?.trim() ?? "";
  if (trimmed === "") return { kind: "forwarded-for", trustedProxyHops: 1 };
  const hops = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (Number.isInteger(hops) && hops >= 1 && hops <= MAX_TRUSTED_PROXY_HOPS) return { kind: "forwarded-for", trustedProxyHops: hops };
  return {
    kind: "invalid",
    reason: `${TRUSTED_PROXY_HOPS_ENV} must be a whole number from 1 to ${String(MAX_TRUSTED_PROXY_HOPS)}, got "${trimmed}"`,
  };
}

/** The resolver for a source; an invalid setting stops the app at start with the reason, never a silent default. */
export function createClientIpResolver(source: ClientIpSource): ClientIpResolver {
  switch (source.kind) {
    case "cloudflare":
      return cloudflareIp();
    case "forwarded-for":
      return forwardedForIp({ trustedProxies: source.trustedProxyHops });
    case "header":
      return headerIp(source.name);
    case "invalid":
      throw new Error(`createClientIpResolver: ${source.reason}`);
  }
}

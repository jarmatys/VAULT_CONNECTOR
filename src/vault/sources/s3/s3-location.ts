// Where an S3-compatible vault lives, as the account typed it: the endpoint, the region, the bucket and the prefix of the
// vault inside it. The endpoint is a URL the server will call, so it is checked before anything is sent: `https` only,
// no credentials in it, and no loopback, private or link-local address (a request forged towards the server's own
// network). A self-hosted instance whose bucket sits on its own network (a local MinIO), and the tests, opt in with
// `allowPrivateEndpoints`.
import { err, ok, type Result } from "@softure-ai/core";

export interface S3Location {
  /** Origin and an optional base path, always ending with `/`; objects are `<endpoint><bucket>/<prefix>/<path>`. */
  readonly endpoint: URL;
  readonly region: string;
  readonly bucket: string;
  /** The vault's folder in the bucket, `/`-separated without leading or trailing `/`; empty for the bucket's root. */
  readonly prefix: string;
}

export interface S3LocationInput {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
}

export type S3LocationErrorCode = "vault.s3_endpoint_invalid" | "vault.s3_endpoint_private" | "vault.s3_region_invalid" | "vault.s3_bucket_invalid" | "vault.s3_prefix_invalid";

/** Most S3-compatible stores take `auto` (R2) or ignore the region; AWS needs the bucket's own. */
export const DEFAULT_S3_REGION = "auto";

const REGION = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** S3's rule, a little wider (some stores allow capitals and underscores). */
const BUCKET = /^[A-Za-z0-9][A-Za-z0-9._-]{1,61}[A-Za-z0-9]$/;
const MAX_PREFIX_LENGTH = 512;

export function parseS3Location(input: S3LocationInput, options: { readonly allowPrivateEndpoints: boolean }): Result<S3Location, S3LocationErrorCode> {
  const endpoint = parseEndpoint(input.endpoint.trim(), options.allowPrivateEndpoints);
  if (!endpoint.ok) return endpoint;
  const region = input.region.trim() === "" ? DEFAULT_S3_REGION : input.region.trim().toLowerCase();
  if (!REGION.test(region)) return err("vault.s3_region_invalid");
  const bucket = input.bucket.trim();
  if (!BUCKET.test(bucket) || bucket.includes("..")) return err("vault.s3_bucket_invalid");
  const prefix = normalizePrefix(input.prefix);
  if (prefix === null) return err("vault.s3_prefix_invalid");
  return ok({ endpoint: endpoint.value, region, bucket, prefix });
}

/** A short name of the location for the panel and the assistant: `bucket/prefix at host`. */
export function describeS3Location(location: Pick<S3Location, "bucket" | "prefix"> & { readonly endpoint: URL | string }): string {
  const host = typeof location.endpoint === "string" ? new URL(location.endpoint).host : location.endpoint.host;
  const path = location.prefix === "" ? location.bucket : `${location.bucket}/${location.prefix}`;
  return `${path} (${host})`;
}

function parseEndpoint(value: string, allowPrivate: boolean): Result<URL, "vault.s3_endpoint_invalid" | "vault.s3_endpoint_private"> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return err("vault.s3_endpoint_invalid");
  }
  const isHttp = url.protocol === "http:";
  if ((url.protocol !== "https:" && !isHttp) || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return err("vault.s3_endpoint_invalid");
  }
  if (!allowPrivate && (isHttp || isPrivateHost(url.hostname))) return err(isHttp ? "vault.s3_endpoint_invalid" : "vault.s3_endpoint_private");
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return ok(url);
}

function normalizePrefix(value: string): string | null {
  const trimmed = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return "";
  if (trimmed.length > MAX_PREFIX_LENGTH) return null;
  const segments = trimmed.split("/");
  const isValid = segments.every((segment) => segment !== "" && segment !== "." && segment !== ".." && !hasControlOrBackslash(segment));
  return isValid ? trimmed : null;
}

function hasControlOrBackslash(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f || char === "\\";
  });
}

/**
 * Whether a URL's host names the server's own network: `localhost`, a single label or an internal suffix, or an IP
 * literal that is loopback, private, link-local, carrier-grade NAT, unspecified or (IPv6) unique-local.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host.includes(":")) return isPrivateIpv6(host);
  const ipv4 = parseIpv4(host);
  if (ipv4 !== null) return isPrivateIpv4(ipv4);
  if (!host.includes(".")) return true;
  return host === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host);
}

function parseIpv4(host: string): readonly number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isPrivateIpv4([a = 0, b = 0]: readonly number[]): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIpv6(host: string): boolean {
  if (host === "::" || host === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (mapped?.[1] !== undefined) {
    const ipv4 = parseIpv4(mapped[1]);
    return ipv4 === null || isPrivateIpv4(ipv4);
  }
  // A mapped address in hex form, or anything starting with ::ffff:, is refused rather than decoded.
  if (host.startsWith("::ffff:")) return true;
  return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
}

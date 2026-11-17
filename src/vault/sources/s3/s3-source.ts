// The S3 adapter of the vault source interface: an S3-compatible bucket (R2, MinIO, B2, Wasabi, AWS) read with a
// read-only key pair, path-style, signed with SigV4. A bucket has no history, so the cursor is a hash of the vault's
// listing (every key with its ETag): it moves when any note is added, changed, renamed or removed, and the five-minute
// check notices that without a push webhook. Listing costs one request per 1 000 objects; the adapter keeps the listing
// it made for its own lifetime (one sync step), so the cursor and the tree of one step share it. A read names the
// version it expects (`If-Match`), so an object changed after the listing reads as gone until the next check.
import { createHash } from "node:crypto";
import { ok, requestBytes, type Clock, type FetchFunction, type HttpBytesFailure } from "@softure-ai/core";
import { EMPTY_PAYLOAD_SHA256, encodeRfc3986, signRequest, type SigV4Credentials } from "@softure-ai/files/server";
import { toSourceFailure, type SourceErrorCode, type SourceFile, type SourceResult, type SourceSnapshot, type VaultSource } from "../source.ts";
import { parseListObjectsPage } from "./s3-listing.ts";
import type { S3Location } from "./s3-location.ts";

/** At most this many objects under the prefix (50 listing calls); a larger bucket answers `source.too_large`. */
export const DEFAULT_MAX_OBJECTS = 50_000;
/** The largest note or attachment one call reads, as for git. */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** One ListObjectsV2 page holds at most 1 000 keys. */
const PAGE_SIZE = 1000;
/** A listing page is XML of at most ~1 000 entries; 4 MB is ample. */
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

export interface S3SourceOptions {
  readonly location: S3Location;
  readonly credentials: SigV4Credentials;
  readonly fetch?: FetchFunction;
  readonly clock?: Clock;
  readonly maxObjects?: number;
  readonly maxFileBytes?: number;
}

export function createS3Source(options: S3SourceOptions): VaultSource & { readonly probe: () => Promise<SourceResult<void>> } {
  const { location } = options;
  const keyPrefix = location.prefix === "" ? "" : `${location.prefix}/`;
  const maxObjects = options.maxObjects ?? DEFAULT_MAX_OBJECTS;
  let listing: Promise<SourceResult<SourceSnapshot>> | null = null;

  function objectUrl(key: string, query: Readonly<Record<string, string>> = {}): URL {
    const path = key === "" ? "" : key.split("/").map(encodeRfc3986).join("/");
    const url = new URL(`${location.endpoint.pathname}${encodeRfc3986(location.bucket)}/${path}`, location.endpoint.origin);
    // The query as sent is the query as signed: RFC 3986 encoding, never `+` for a space.
    const pairs = Object.entries(query).map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`);
    url.search = pairs.length === 0 ? "" : `?${pairs.join("&")}`;
    return url;
  }

  async function get(url: URL, input: { readonly headers?: Readonly<Record<string, string>>; readonly maxBytes: number }): Promise<SourceResult<Uint8Array>> {
    const headers = signRequest({
      method: "GET",
      url,
      headers: input.headers ?? {},
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      region: location.region,
      credentials: options.credentials,
      date: (options.clock?.now() ?? new Date()),
    });
    // fetch sets Host itself from the URL, the same value that was signed.
    const sent: Record<string, string> = { ...headers };
    delete sent.host;
    const answer = await requestBytes({
      url,
      headers: sent,
      maxBytes: input.maxBytes,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    return answer.ok ? ok(answer.value.bytes) : toFailure(answer);
  }

  async function listPage(token: string | null, maxKeys: number): Promise<SourceResult<ReturnType<typeof parseListObjectsPage> & object>> {
    const query: Record<string, string> = { "list-type": "2", "max-keys": String(maxKeys), prefix: keyPrefix };
    if (token !== null) query["continuation-token"] = token;
    const body = await get(objectUrl("", query), { maxBytes: MAX_PAGE_BYTES });
    if (!body.ok) return body;
    const page = parseListObjectsPage(new TextDecoder().decode(body.value));
    return page === null ? toSourceFailure("source.unexpected") : ok(page);
  }

  async function listAll(): Promise<SourceResult<SourceSnapshot>> {
    const files: SourceFile[] = [];
    let token: string | null = null;
    do {
      const page = await listPage(token, PAGE_SIZE);
      if (!page.ok) return page;
      for (const object of page.value.objects) {
        // Folder markers (`Notes/`) and keys outside the prefix are not files of the vault.
        if (!object.key.startsWith(keyPrefix) || object.key.endsWith("/")) continue;
        files.push({ path: object.key.slice(keyPrefix.length), version: object.etag, size: object.size });
      }
      if (files.length > maxObjects) return toSourceFailure("source.too_large");
      token = page.value.nextToken;
    } while (token !== null);
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return ok({ cursor: toCursor(files), files });
  }

  function readListing(): Promise<SourceResult<SourceSnapshot>> {
    listing ??= listAll().then((result) => {
      // A failed listing is not kept: the next call tries again.
      if (!result.ok) listing = null;
      return result;
    });
    return listing;
  }

  return {
    kind: "s3",

    async getCursor() {
      const snapshot = await readListing();
      return snapshot.ok ? ok(snapshot.value.cursor) : snapshot;
    },

    listTree: readListing,

    async readFile(file) {
      return get(objectUrl(`${keyPrefix}${file.path}`), { headers: { "if-match": `"${file.version}"` }, maxBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES });
    },

    async listChangesSince(cursor) {
      const snapshot = await readListing();
      if (!snapshot.ok) return snapshot;
      // The listing is the difference: the sync diffs it against its copies, so nothing finer is listed here.
      return ok(snapshot.value.cursor === cursor ? { kind: "changes", cursor, changes: [] } : { kind: "full_resync", cursor: snapshot.value.cursor });
    },

    /** One listing call of one key: whether the endpoint, the bucket and the keys answer, before anything is stored. */
    async probe() {
      const page = await listPage(null, 1);
      return page.ok ? ok(undefined) : page;
    },
  };
}

/** `s3-` and the SHA-256 of the sorted `path\tversion` lines: equal listings, equal cursors. */
function toCursor(files: readonly SourceFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) hash.update(`${file.path}\t${file.version}\n`);
  return `s3-${hash.digest("hex")}`;
}

/**
 * core's HTTP failure as a source code: 404 (no bucket or object) and 412 (changed since the listing) not found;
 * 401/403 disconnected (keys refused or revoked); 429 and 503 (S3's SlowDown) rate limited; other 5xx and the network
 * unavailable; 409 and anything else unexpected.
 */
function toFailure(answer: HttpBytesFailure): SourceResult<never> {
  const retryAfter = "retryAfterSeconds" in answer ? answer.retryAfterSeconds : null;
  if (answer.status === 404 || answer.status === 412) return toSourceFailure("source.not_found");
  if (answer.status === 503 || answer.error === "core.http_rate_limited") return toSourceFailure("source.rate_limited", retryAfter);
  const code: SourceErrorCode = toCode(answer);
  return toSourceFailure(code, retryAfter);
}

function toCode(answer: HttpBytesFailure): SourceErrorCode {
  switch (answer.error) {
    case "core.http_refused":
      return answer.status === 401 || answer.status === 403 ? "source.disconnected" : "source.unexpected";
    case "core.http_too_large":
      return "source.too_large";
    case "core.http_unreachable":
    case "core.http_unavailable":
      return "source.unavailable";
    default:
      return "source.unexpected";
  }
}

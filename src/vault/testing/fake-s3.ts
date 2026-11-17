// An S3-compatible store in memory for the source tests and the end-to-end fake services: path-style ListObjectsV2
// (`list-type=2`, prefix, max-keys, continuation tokens) and GetObject with `If-Match`, answered only to requests
// signed (SigV4) with the one key pair it knows. ETags are MD5 of the content, as S3 gives for a single-part upload.
// Failures can be injected per operation.
import { createHash } from "node:crypto";
import { signRequest } from "@softure-ai/files/server";

export interface FakeS3Options {
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** The endpoint's base path, as the account types it after the origin (`/s3` for `http://host/s3`). */
  readonly basePath?: string;
}

export type FakeS3Operation = "list" | "get";

export interface FakeS3 {
  readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** Answers one request (for an HTTP server that hands its requests over). */
  readonly handle: (request: Request) => Promise<Response>;
  put(key: string, content: string | Uint8Array): void;
  remove(key: string): void;
  /** Answers every following request of `operation` with this status until cleared with null. */
  fail(operation: FakeS3Operation, status: number | null): void;
  readonly calls: Readonly<Record<FakeS3Operation, number>>;
}

export function createFakeS3(options: FakeS3Options): FakeS3 {
  const objects = new Map<string, Uint8Array>();
  const failures = new Map<FakeS3Operation, number>();
  const calls: Record<FakeS3Operation, number> = { list: 0, get: 0 };
  const basePath = (options.basePath ?? "").replace(/\/+$/, "");
  const encoder = new TextEncoder();

  const etagOf = (content: Uint8Array) => createHash("md5").update(content).digest("hex");

  function handle(request: Request): Promise<Response> {
    return Promise.resolve(answer(request));
  }

  function answer(request: Request): Response {
    const url = new URL(request.url);
    if (request.method !== "GET") return xmlError(405, "MethodNotAllowed");
    if (!isSigned(request, url, options)) return xmlError(403, "SignatureDoesNotMatch");
    const bucketPath = `${basePath}/${encodeURIComponent(options.bucket)}`;
    if (url.pathname !== bucketPath && !url.pathname.startsWith(`${bucketPath}/`)) return xmlError(404, "NoSuchBucket");
    const key = decodeURIComponent(url.pathname.slice(bucketPath.length + 1));
    if (key === "") {
      calls.list += 1;
      const failure = failures.get("list");
      if (failure !== undefined) return xmlError(failure, "Injected");
      return list(url);
    }
    calls.get += 1;
    const failure = failures.get("get");
    if (failure !== undefined) return xmlError(failure, "Injected");
    const content = objects.get(key);
    if (content === undefined) return xmlError(404, "NoSuchKey");
    const etag = `"${etagOf(content)}"`;
    const ifMatch = request.headers.get("if-match");
    if (ifMatch !== null && ifMatch !== etag) return xmlError(412, "PreconditionFailed");
    return new Response(content.slice(), { status: 200, headers: { etag, "content-length": String(content.byteLength) } });
  }

  function list(url: URL): Response {
    if (url.searchParams.get("list-type") !== "2") return xmlError(400, "InvalidArgument");
    const prefix = url.searchParams.get("prefix") ?? "";
    const maxKeys = Math.min(1000, Number(url.searchParams.get("max-keys") ?? "1000"));
    const start = Number(url.searchParams.get("continuation-token") ?? "0");
    const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const page = keys.slice(start, start + maxKeys);
    const isTruncated = start + maxKeys < keys.length;
    const contents = page
      .map((key) => {
        const content = objects.get(key) ?? new Uint8Array();
        return `<Contents><Key>${escapeXml(key)}</Key><LastModified>2026-11-17T00:00:00.000Z</LastModified><ETag>&quot;${etagOf(content)}&quot;</ETag><Size>${String(content.byteLength)}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
      })
      .join("");
    const next = isTruncated ? `<NextContinuationToken>${String(start + maxKeys)}</NextContinuationToken>` : "";
    const body = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${escapeXml(options.bucket)}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${String(page.length)}</KeyCount><MaxKeys>${String(maxKeys)}</MaxKeys><IsTruncated>${String(isTruncated)}</IsTruncated>${contents}${next}</ListBucketResult>`;
    return new Response(body, { status: 200, headers: { "content-type": "application/xml" } });
  }

  return {
    calls,
    handle,
    fetch: (input, init) => handle(new Request(input, init)),
    put(key, content) {
      objects.set(key, typeof content === "string" ? encoder.encode(content) : content);
    },
    remove(key) {
      objects.delete(key);
    },
    fail(operation, status) {
      if (status === null) failures.delete(operation);
      else failures.set(operation, status);
    },
  };
}

/** Recomputes the request's signature with the known key pair and compares it with the one it carries. */
function isSigned(request: Request, url: URL, options: FakeS3Options): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(authorization);
  const amzDate = request.headers.get("x-amz-date");
  if (match === null || amzDate === null || match[1] !== options.accessKeyId) return false;
  const [, , , region = "", signed = ""] = match;
  const date = new Date(`${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`);
  const headers: Record<string, string> = {};
  for (const name of signed.split(";")) {
    if (name === "host" || name === "x-amz-date" || name === "x-amz-content-sha256") continue;
    headers[name] = request.headers.get(name) ?? "";
  }
  const expected = signRequest({
    method: request.method,
    url,
    headers,
    payloadSha256: request.headers.get("x-amz-content-sha256") ?? "",
    region,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    date,
  });
  return expected.authorization === authorization;
}

function xmlError(status: number, code: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`, { status, headers: { "content-type": "application/xml" } });
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

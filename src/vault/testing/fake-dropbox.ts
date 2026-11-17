// A Dropbox in memory for the source tests and the end-to-end fake services: the OAuth 2 code flow with PKCE (an
// approval step that stands in for the person on Dropbox's consent page), the refresh grant and revocation, a
// recursive `list_folder` with pages and `continue`, and `download` by revision. Only the one app's key and secret and
// the tokens it issued are accepted. Each write gives a file a new revision and retires the old one (stricter than
// Dropbox, which keeps old revisions a while: the source contract asks a superseded version to read as gone, and the
// sync copes either way, since its next check sees the new revision). Failures can be injected per operation.
import { createHash } from "node:crypto";

export interface FakeDropboxOptions {
  readonly appKey: string;
  readonly appSecret: string;
  /** Entries per listing page; Dropbox answers up to 2 000. */
  readonly pageSize?: number;
  /**
   * Answer `path_display` with every parent in lower case, as Dropbox may (it keeps the case of the last component
   * only), so a test can check that paths are rebuilt from folder names.
   */
  readonly lowerCaseParents?: boolean;
}

export type FakeDropboxOperation = "token" | "list" | "download";

export interface FakeDropboxApproval {
  /** The person declines on the consent page. */
  readonly deny?: boolean;
  /** The scopes the grant carries; by default the ones asked for. */
  readonly grantScopes?: readonly string[];
  readonly accountId?: string;
}

export interface FakeDropbox {
  /** Answers requests to Dropbox's API, content and token hosts. */
  readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** The consent page: the browser's visit to the authorize URL, approved or declined; answers the redirect URL. */
  approve(authorizeUrl: string | URL, approval?: FakeDropboxApproval): URL;
  /** Writes a file at a path (`/Obsidian/Vault/Note.md`, any case kept), with a new revision. */
  put(path: string, content: string | Uint8Array): void;
  remove(path: string): void;
  /** Answers every following request of `operation` with this status until cleared with null. */
  fail(operation: FakeDropboxOperation, status: number | null): void;
  /** Revokes every token issued so far (the person removed the app from their Dropbox). */
  revokeAll(): void;
  readonly calls: Readonly<Record<FakeDropboxOperation, number>>;
  /** Whether a token is still accepted (revocation tests). */
  isTokenLive(token: string): boolean;
}

interface FakeFile {
  readonly displayPath: string;
  readonly content: Uint8Array;
  readonly rev: string;
}

interface PendingCode {
  readonly redirectUri: string;
  readonly challenge: string;
  readonly scopes: readonly string[];
  readonly accountId: string;
}

interface Grant {
  readonly refreshToken: string;
  readonly scopes: readonly string[];
  readonly accountId: string;
  isRevoked: boolean;
}

const REQUIRED_PREFIX = "https://";

export function createFakeDropbox(options: FakeDropboxOptions): FakeDropbox {
  const files = new Map<string, FakeFile>();
  /** Revisions still downloadable: every revision ever written, until its file is removed. */
  const revisions = new Map<string, FakeFile>();
  const codes = new Map<string, PendingCode>();
  const grants = new Map<string, Grant>();
  const accessTokens = new Map<string, Grant>();
  const failures = new Map<FakeDropboxOperation, number>();
  const calls: Record<FakeDropboxOperation, number> = { token: 0, list: 0, download: 0 };
  const pageSize = options.pageSize ?? 2000;
  const encoder = new TextEncoder();
  let counter = 0;

  const next = (label: string) => {
    counter += 1;
    return `${label}${String(counter).padStart(6, "0")}${createHash("sha256").update(`${label}${String(counter)}`).digest("hex").slice(0, 24)}`;
  };

  function put(path: string, content: string | Uint8Array): void {
    const displayPath = normalize(path);
    const lower = displayPath.toLowerCase();
    const previous = files.get(lower);
    if (previous !== undefined) revisions.delete(previous.rev);
    const file = { displayPath, content: typeof content === "string" ? encoder.encode(content) : content, rev: next("0") };
    files.set(lower, file);
    revisions.set(file.rev, file);
  }

  function remove(path: string): void {
    const lower = normalize(path).toLowerCase();
    const file = files.get(lower);
    if (file === undefined) return;
    files.delete(lower);
    revisions.delete(file.rev);
  }

  function approve(authorizeUrl: string | URL, approval: FakeDropboxApproval = {}): URL {
    const url = new URL(authorizeUrl);
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("client_id") !== options.appKey || redirectUri === null || state === null) throw new Error("fake Dropbox: authorize URL without the app's client_id, redirect_uri or state");
    if (url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256") throw new Error("fake Dropbox: expected the code flow with PKCE S256");
    const callback = new URL(redirectUri);
    callback.searchParams.set("state", state);
    if (approval.deny === true) {
      callback.searchParams.set("error", "access_denied");
      return callback;
    }
    const code = next("code-");
    const asked = (url.searchParams.get("scope") ?? "").split(/\s+/).filter((scope) => scope !== "");
    codes.set(code, {
      redirectUri,
      challenge: url.searchParams.get("code_challenge") ?? "",
      scopes: approval.grantScopes ?? asked,
      accountId: approval.accountId ?? "dbid:AAFictionalAccount0001",
    });
    callback.searchParams.set("code", code);
    return callback;
  }

  function fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    return Promise.resolve(answer(input, init));
  }

  function answer(input: string | URL, init?: RequestInit): Response {
    const url = new URL(input.toString());
    if (!url.href.startsWith(REQUIRED_PREFIX)) return json(400, { error: "fake Dropbox: https only" });
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
    if (url.host === "api.dropboxapi.com" && url.pathname === "/oauth2/token") return token(new URLSearchParams(body));
    if (url.host === "api.dropboxapi.com" && url.pathname === "/2/auth/token/revoke") {
      const grant = readGrant(headers);
      if (grant === null) return json(401, { error_summary: "invalid_access_token/" });
      grant.isRevoked = true;
      return json(200, null);
    }
    if (url.host === "api.dropboxapi.com" && (url.pathname === "/2/files/list_folder" || url.pathname === "/2/files/list_folder/continue")) {
      calls.list += 1;
      const failure = failures.get("list");
      if (failure !== undefined) return json(failure, { error_summary: "injected/" });
      const grant = readGrant(headers);
      if (grant === null) return json(401, { error_summary: "expired_access_token/" });
      if (!grant.scopes.includes("files.metadata.read")) return json(401, { error_summary: "missing_scope/" });
      return list(url.pathname.endsWith("/continue"), parseJson(body));
    }
    if (url.host === "content.dropboxapi.com" && url.pathname === "/2/files/download") {
      calls.download += 1;
      const failure = failures.get("download");
      if (failure !== undefined) return json(failure, { error_summary: "injected/" });
      const grant = readGrant(headers);
      if (grant === null) return json(401, { error_summary: "expired_access_token/" });
      if (!grant.scopes.includes("files.content.read")) return json(401, { error_summary: "missing_scope/" });
      const argument = parseJson(headers.get("dropbox-api-arg") ?? "");
      const path = typeof argument?.path === "string" ? argument.path : "";
      const file = path.startsWith("rev:") ? revisions.get(path.slice(4)) : files.get(path.toLowerCase());
      if (file === undefined) return json(409, { error_summary: "path/not_found/", error: { ".tag": "path", path: { ".tag": "not_found" } } });
      return new Response(file.content.slice(), { status: 200, headers: { "content-type": "application/octet-stream", "content-length": String(file.content.byteLength) } });
    }
    return json(404, { error_summary: "fake Dropbox: unknown endpoint" });
  }

  function token(form: URLSearchParams): Response {
    calls.token += 1;
    const failure = failures.get("token");
    if (failure !== undefined) return json(failure, { error: "temporarily_unavailable" });
    if (form.get("client_id") !== options.appKey || form.get("client_secret") !== options.appSecret) return json(400, { error: "invalid_client" });
    if (form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? "";
      const pending = codes.get(code);
      codes.delete(code);
      if (pending === undefined || pending.redirectUri !== form.get("redirect_uri")) return json(400, { error: "invalid_grant" });
      const verifier = form.get("code_verifier") ?? "";
      if (createHash("sha256").update(verifier).digest("base64url") !== pending.challenge) return json(400, { error: "invalid_grant" });
      const grant: Grant = { refreshToken: next("refresh-"), scopes: pending.scopes, accountId: pending.accountId, isRevoked: false };
      grants.set(grant.refreshToken, grant);
      return json(200, { ...issueAccess(grant), refresh_token: grant.refreshToken, scope: grant.scopes.join(" "), account_id: grant.accountId, uid: "12345" });
    }
    if (form.get("grant_type") === "refresh_token") {
      const grant = grants.get(form.get("refresh_token") ?? "");
      if (grant === undefined || grant.isRevoked) return json(400, { error: "invalid_grant" });
      return json(200, issueAccess(grant));
    }
    return json(400, { error: "unsupported_grant_type" });
  }

  function issueAccess(grant: Grant): { access_token: string; token_type: string; expires_in: number } {
    const accessToken = next("sl.");
    accessTokens.set(accessToken, grant);
    return { access_token: accessToken, token_type: "bearer", expires_in: 14400 };
  }

  function readGrant(headers: Headers): Grant | null {
    const value = headers.get("authorization") ?? "";
    const grant = value.startsWith("Bearer ") ? accessTokens.get(value.slice(7)) : undefined;
    return grant === undefined || grant.isRevoked ? null : grant;
  }

  function list(isContinue: boolean, body: Record<string, unknown> | null): Response {
    let path: string;
    let recursive: boolean;
    let start: number;
    let limit: number;
    if (isContinue) {
      const cursor = typeof body?.cursor === "string" ? parseCursor(body.cursor) : null;
      if (cursor === null) return json(409, { error_summary: "reset/", error: { ".tag": "reset" } });
      ({ path, recursive, start, limit } = cursor);
    } else {
      path = typeof body?.path === "string" ? body.path : "";
      recursive = body?.recursive === true;
      start = 0;
      limit = typeof body?.limit === "number" ? Math.min(body.limit, pageSize) : pageSize;
      if (path !== "" && !isFolder(path.toLowerCase())) {
        const tag = files.has(path.toLowerCase()) ? "not_folder" : "not_found";
        return json(409, { error_summary: `path/${tag}/`, error: { ".tag": "path", path: { ".tag": tag } } });
      }
    }
    const entries = listEntries(path.toLowerCase(), recursive);
    const page = entries.slice(start, start + limit);
    const hasMore = start + limit < entries.length;
    const cursor = Buffer.from(JSON.stringify({ path, recursive, start: start + limit, limit })).toString("base64url");
    return json(200, { entries: page, cursor, has_more: hasMore });
  }

  function isFolder(lower: string): boolean {
    for (const key of files.keys()) if (key.startsWith(`${lower}/`)) return true;
    return false;
  }

  function listEntries(lower: string, recursive: boolean): unknown[] {
    const prefix = lower === "" ? "/" : `${lower}/`;
    const folders = new Map<string, string>();
    const fileEntries: unknown[] = [];
    for (const [key, file] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length).split("/");
      const displayRest = file.displayPath.split("/").slice(-rest.length);
      if (!recursive && rest.length > 1) {
        folders.set(`${prefix}${rest[0] ?? ""}`, displayRest[0] ?? "");
        continue;
      }
      for (let index = 1; index < rest.length; index += 1) folders.set(`${prefix}${rest.slice(0, index).join("/")}`, displayRest[index - 1] ?? "");
      const name = displayRest[displayRest.length - 1] ?? "";
      fileEntries.push({ ".tag": "file", name, path_lower: key, path_display: toDisplay(file.displayPath), id: `id:${file.rev}`, rev: file.rev, size: file.content.byteLength, content_hash: createHash("sha256").update(file.content).digest("hex") });
    }
    const folderEntries = [...folders.entries()].map(([key, name]) => ({ ".tag": "folder", name, path_lower: key, path_display: toDisplay(`${key.slice(0, key.lastIndexOf("/") + 1)}${name}`), id: `id:${key}` }));
    return [...folderEntries, ...fileEntries];
  }

  function toDisplay(displayPath: string): string {
    if (options.lowerCaseParents !== true) return displayPath;
    const index = displayPath.lastIndexOf("/");
    return `${displayPath.slice(0, index).toLowerCase()}${displayPath.slice(index)}`;
  }

  return {
    fetch,
    approve,
    put,
    remove,
    fail: (operation, status) => (status === null ? failures.delete(operation) : failures.set(operation, status)),
    revokeAll: () => {
      for (const grant of grants.values()) grant.isRevoked = true;
    },
    calls,
    isTokenLive: (token) => {
      const grant = accessTokens.get(token) ?? grants.get(token);
      return grant !== undefined && !grant.isRevoked;
    },
  };
}

function normalize(path: string): string {
  return `/${path.replace(/^\/+/, "")}`;
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseCursor(value: string): { path: string; recursive: boolean; start: number; limit: number } | null {
  const parsed = parseJson(Buffer.from(value, "base64url").toString("utf8"));
  if (parsed === null || typeof parsed.path !== "string" || typeof parsed.start !== "number" || typeof parsed.limit !== "number") return null;
  return { path: parsed.path, recursive: parsed.recursive === true, start: parsed.start, limit: parsed.limit };
}

function json(status: number, body: unknown): Response {
  return new Response(body === null ? "null" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

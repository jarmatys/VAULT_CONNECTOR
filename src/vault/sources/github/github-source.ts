// The git adapter of the vault source interface, over GitHub's git data API with an installation token of the
// account's own installation: the head commit of the branch (`commits/{branch}`), the whole tree in one listing
// (`git/trees/{tree}?recursive=1`), one blob at a time (`git/blobs/{sha}`, raw) and the difference between two
// commits (`compare/{base}...{head}`). Every call is bounded, so a sync can stop between two of them and resume, and a
// file is read on its own, never a whole archive (the 128 MB isolate on Workers; research of account-connects-git-source).
import { ok, requestBytes, requestJson, type FetchFunction, type HttpBytesFailure, type HttpJsonFailure } from "@softure-ai/core";
import { z } from "zod";
import { toSourceFailure, type SourceChange, type SourceErrorCode, type SourceFile, type SourceResult, type VaultSource } from "../source.ts";

export const GITHUB_API_URL = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** GitHub lists at most 300 files of a comparison; at the cap the list may be cut, so the caller resyncs. */
export const COMPARE_FILE_CAP = 300;

/** The largest note or attachment one call reads (GitHub's blob API serves up to 100 MB). */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface GithubRepositoryRef {
  /** `owner/name`. */
  readonly fullName: string;
  readonly branch: string;
}

export interface GithubSourceOptions {
  readonly repository: GithubRepositoryRef;
  /** An installation token that reaches the repository with contents read; minted per unit of work. */
  readonly getToken: () => Promise<SourceResult<string>>;
  readonly fetch?: FetchFunction;
  readonly apiUrl?: string;
  readonly maxFileBytes?: number;
}

const commitSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/), commit: z.object({ tree: z.object({ sha: z.string().min(1) }) }) });

const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(z.object({ path: z.string().min(1), mode: z.string(), type: z.string(), sha: z.string().min(1), size: z.number().int().nonnegative().optional() })),
});

const compareSchema = z.object({
  status: z.enum(["ahead", "behind", "diverged", "identical"]),
  files: z
    .array(
      z.object({
        filename: z.string().min(1),
        status: z.enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
        sha: z.string().nullish(),
        previous_filename: z.string().nullish(),
      }),
    )
    .default([]),
});

/** Git modes of entries that are not plain files: symlinks (120000) and submodules (160000). */
const NON_FILE_MODES: ReadonlySet<string> = new Set(["120000", "160000"]);

export function createGithubSource(options: GithubSourceOptions): VaultSource {
  const apiUrl = (options.apiUrl ?? GITHUB_API_URL).replace(/\/+$/, "");
  const repositoryPath = `${apiUrl}/repos/${options.repository.fullName.split("/").map(encodeURIComponent).join("/")}`;

  async function getJson<S extends z.ZodType>(path: string, schema: S): Promise<SourceResult<z.output<S>>> {
    const token = await options.getToken();
    if (!token.ok) return token;
    const answer = await requestJson({
      url: `${repositoryPath}${path}`,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token.value}`, "x-github-api-version": API_VERSION },
      schema,
      readHeaders: ["x-ratelimit-remaining"],
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    if (!answer.ok) return toFailure(answer);
    return ok(answer.value.body);
  }

  async function readHead(): Promise<SourceResult<{ readonly sha: string; readonly treeSha: string }>> {
    const commit = await getJson(`/commits/${encodeURIComponent(options.repository.branch)}`, commitSchema);
    if (!commit.ok) return commit;
    return ok({ sha: commit.value.sha, treeSha: commit.value.commit.tree.sha });
  }

  return {
    kind: "github",

    async getCursor() {
      const head = await readHead();
      return head.ok ? ok(head.value.sha) : head;
    },

    async listTree() {
      const head = await readHead();
      if (!head.ok) return head;
      const tree = await getJson(`/git/trees/${encodeURIComponent(head.value.treeSha)}?recursive=1`, treeSchema);
      if (!tree.ok) return tree;
      // A cut listing would look like deleted files to the sync; refuse it rather than work from part of the vault.
      if (tree.value.truncated) return toSourceFailure("source.too_large");
      const files: SourceFile[] = tree.value.tree
        .filter((entry) => entry.type === "blob" && !NON_FILE_MODES.has(entry.mode))
        .map((entry) => ({ path: entry.path, version: entry.sha, size: entry.size ?? 0 }));
      return ok({ cursor: head.value.sha, files });
    },

    async readFile(file) {
      const token = await options.getToken();
      if (!token.ok) return token;
      const answer = await requestBytes({
        url: `${repositoryPath}/git/blobs/${encodeURIComponent(file.version)}`,
        headers: { authorization: `Bearer ${token.value}`, "x-github-api-version": API_VERSION },
        accept: "application/vnd.github.raw",
        maxBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });
      if (!answer.ok) return toFailure(answer);
      return ok(answer.value.bytes);
    },

    async listChangesSince(cursor) {
      const head = await readHead();
      if (!head.ok) return head;
      if (head.value.sha === cursor) return ok({ kind: "changes", cursor, changes: [] });
      const comparison = await getJson(`/compare/${encodeURIComponent(cursor)}...${head.value.sha}`, compareSchema);
      // A cursor GitHub no longer knows (history rewritten and collected) cannot be compared: list the tree again.
      if (!comparison.ok) return comparison.error === "source.not_found" ? ok({ kind: "full_resync", cursor: head.value.sha }) : comparison;
      const isLinear = comparison.value.status === "ahead" || comparison.value.status === "identical";
      if (!isLinear || comparison.value.files.length >= COMPARE_FILE_CAP) return ok({ kind: "full_resync", cursor: head.value.sha });
      const changes = comparison.value.files.flatMap((entry): SourceChange[] => toChange(entry));
      return ok({ kind: "changes", cursor: head.value.sha, changes });
    },
  };
}

function toChange(entry: z.output<typeof compareSchema>["files"][number]): SourceChange[] {
  const version = entry.sha ?? "";
  switch (entry.status) {
    case "removed":
      return [{ kind: "removed", path: entry.filename }];
    case "renamed":
      return entry.previous_filename === null || entry.previous_filename === undefined
        ? [{ kind: "added", path: entry.filename, version }]
        : [{ kind: "renamed", path: entry.filename, previousPath: entry.previous_filename, version }];
    case "added":
    case "copied":
      return [{ kind: "added", path: entry.filename, version }];
    case "modified":
    case "changed":
      return [{ kind: "modified", path: entry.filename, version }];
    case "unchanged":
      return [];
  }
}

/** core's HTTP failure as a source code: 404 not found, 401/403 disconnected (403 with no requests left: rate limit). */
function toFailure(answer: HttpJsonFailure | HttpBytesFailure): SourceResult<never> {
  if (answer.status === 404 || answer.status === 409) return toSourceFailure("source.not_found");
  const headers = "headers" in answer ? answer.headers : undefined;
  const isRateLimitRefusal = answer.status === 403 && headers?.["x-ratelimit-remaining"] === "0";
  if (answer.error === "core.http_rate_limited" || isRateLimitRefusal) {
    return toSourceFailure("source.rate_limited", "retryAfterSeconds" in answer ? answer.retryAfterSeconds : null);
  }
  const code: SourceErrorCode = toCode(answer.error);
  return toSourceFailure(code, "retryAfterSeconds" in answer ? answer.retryAfterSeconds : null);
}

function toCode(error: (HttpJsonFailure | HttpBytesFailure)["error"]): SourceErrorCode {
  switch (error) {
    case "core.http_refused":
      return "source.disconnected";
    case "core.http_too_large":
      return "source.too_large";
    case "core.http_unreachable":
    case "core.http_unavailable":
      return "source.unavailable";
    default:
      return "source.unexpected";
  }
}

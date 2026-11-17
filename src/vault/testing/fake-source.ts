// A vault source in memory for the sync tests: a map of paths to texts, a cursor that moves with every change, version
// names derived from the content, call counters, and failures to inject (one call or every call).
import { ok } from "@softure-ai/core";
import { createHash } from "node:crypto";
import { toSourceFailure, type SourceErrorCode, type SourceFile, type SourceResult, type VaultSource } from "../sources/source.ts";

export interface FakeSource extends VaultSource {
  /** Writes (adds or changes) a file and moves the cursor. */
  write(path: string, text: string | Uint8Array): void;
  remove(path: string): void;
  rename(from: string, to: string): void;
  /** Lists a file with this size without storing its bytes (an oversized note). */
  writeSized(path: string, size: number): void;
  /** Fails every following call of `operation` with `error` until cleared with null. */
  fail(operation: keyof Calls, error: SourceErrorCode | null, retryAfterSeconds?: number | null): void;
  readonly calls: Readonly<Calls>;
}

interface Calls {
  getCursor: number;
  listTree: number;
  readFile: number;
  listChangesSince: number;
}

export function createFakeSource(files: Readonly<Record<string, string>> = {}): FakeSource {
  const contents = new Map<string, Uint8Array | number>();
  let revision = 0;
  const calls: Calls = { getCursor: 0, listTree: 0, readFile: 0, listChangesSince: 0 };
  const failures = new Map<keyof Calls, { error: SourceErrorCode; retryAfterSeconds: number | null }>();
  const encoder = new TextEncoder();

  const cursor = () => `rev-${String(revision)}`;
  const versionOf = (path: string, value: Uint8Array | number) =>
    createHash("sha1").update(path).update(typeof value === "number" ? `size:${String(value)}` : value).digest("hex");
  const failure = <T>(operation: keyof Calls): SourceResult<T> | null => {
    calls[operation] += 1;
    const injected = failures.get(operation);
    return injected === undefined ? null : toSourceFailure(injected.error, injected.retryAfterSeconds);
  };

  for (const [path, text] of Object.entries(files)) contents.set(path, encoder.encode(text));

  return {
    kind: "github",
    calls,
    write(path, text) {
      contents.set(path, typeof text === "string" ? encoder.encode(text) : text);
      revision += 1;
    },
    writeSized(path, size) {
      contents.set(path, size);
      revision += 1;
    },
    remove(path) {
      contents.delete(path);
      revision += 1;
    },
    rename(from, to) {
      const value = contents.get(from);
      if (value === undefined) throw new Error(`No file ${from} to rename`);
      contents.delete(from);
      contents.set(to, value);
      revision += 1;
    },
    fail(operation, error, retryAfterSeconds = null) {
      if (error === null) failures.delete(operation);
      else failures.set(operation, { error, retryAfterSeconds });
    },
    getCursor() {
      return Promise.resolve(failure<string>("getCursor") ?? ok(cursor()));
    },
    listTree() {
      const failed = failure<{ cursor: string; files: SourceFile[] }>("listTree");
      if (failed !== null) return Promise.resolve(failed);
      const listed: SourceFile[] = [...contents].map(([path, value]) => ({
        path,
        version: versionOf(path, value),
        size: typeof value === "number" ? value : value.byteLength,
      }));
      return Promise.resolve(ok({ cursor: cursor(), files: listed }));
    },
    readFile(file) {
      const failed = failure<Uint8Array>("readFile");
      if (failed !== null) return Promise.resolve(failed);
      const value = contents.get(file.path);
      if (value === undefined || versionOf(file.path, value) !== file.version) return Promise.resolve(toSourceFailure("source.not_found"));
      if (typeof value === "number") return Promise.resolve(toSourceFailure("source.too_large"));
      return Promise.resolve(ok(value));
    },
    listChangesSince() {
      return Promise.resolve(failure("listChangesSince") ?? ok({ kind: "full_resync" as const, cursor: cursor() }));
    },
  };
}

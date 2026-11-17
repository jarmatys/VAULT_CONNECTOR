// One session on the sync service's socket: `init` with the session token and the vault's key hash, the records the
// service pushes since a version (every record from version 0, so the whole vault), `ready`, then pulls of single
// records, each answered by a JSON header and the encrypted bytes in binary pieces. The session never pushes: the
// product only reads. It closes itself after a short idle time, since an adapter lives for one sync step and has no
// close call of its own. The token never reaches a log or an error.
import { ok } from "@softure-ai/core";
import { z } from "zod";
import { toSourceFailure, type SourceResult } from "../source.ts";
import type { EncryptionVersion } from "./sync-crypto.ts";

/** The parts of a WebSocket the session uses: the platform's own in production, an in-memory fake in tests. */
export interface SyncSocketLike {
  binaryType: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: { readonly data?: unknown }) => void): void;
}

export type SyncSocketFactory = (url: string) => SyncSocketLike;

/** The platform's WebSocket (Node 22 and Workers both have the standard constructor). */
export const platformSocketFactory: SyncSocketFactory = (url) => new WebSocket(url);

/** One record as the service pushes it; `path` and `hash` still encrypted. */
export interface SyncPush {
  readonly uid: number;
  readonly path: string;
  readonly folder: boolean;
  readonly deleted: boolean;
  /** Encrypted bytes (0 for an empty file). */
  readonly size: number;
}

export interface SyncSession {
  /** The vault's version when the service said `ready`. */
  readonly version: number;
  /** Every record pushed before `ready`, in the order received. */
  readonly pushes: readonly SyncPush[];
  /** One record's encrypted bytes; a record the service no longer has is `source.not_found`. */
  pull(uid: number, maxBytes: number): Promise<SourceResult<Uint8Array>>;
  close(): void;
}

export interface SyncSessionInput {
  /** `wss://<host>` (or `ws://` for the loopback fake), already checked against the allow-list. */
  readonly url: string;
  readonly token: string;
  readonly vaultId: string;
  readonly keyHash: string;
  readonly encryptionVersion: EncryptionVersion;
  /** Records newer than this are pushed; 0 for the whole vault. */
  readonly version: number;
  readonly socketFactory?: SyncSocketFactory;
  /** Milliseconds to wait for each answer; defaults to 30 s. */
  readonly timeoutMs?: number;
  /** Milliseconds without a call before the session closes; defaults to 10 s. */
  readonly idleMs?: number;
}

/** The name this client gives itself in the vault's version history. */
export const SYNC_DEVICE_NAME = "VaultConnector (read-only)";

const pushMessage = z.object({
  op: z.literal("push"),
  uid: z.number().int().nonnegative(),
  path: z.string().max(20_000),
  folder: z.boolean().optional(),
  deleted: z.boolean().optional(),
  size: z.number().int().nonnegative().optional(),
});
const pullHeader = z.object({ size: z.number().int().nonnegative(), pieces: z.number().int().nonnegative().max(10_000), deleted: z.boolean().optional() }).loose();

type Incoming = { readonly kind: "json"; readonly value: Record<string, unknown> } | { readonly kind: "binary"; readonly bytes: Uint8Array };

export async function openSyncSession(input: SyncSessionInput): Promise<SourceResult<SyncSession>> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const idleMs = input.idleMs ?? 10_000;
  let socket: SyncSocketLike;
  try {
    socket = (input.socketFactory ?? platformSocketFactory)(input.url);
  } catch {
    return toSourceFailure("source.unavailable");
  }
  try {
    socket.binaryType = "arraybuffer";
  } catch {
    // A platform whose sockets always hand binary frames over as ArrayBuffer (Workers) may not let it be set.
  }
  const queue: Incoming[] = [];
  let waiter: ((item: Incoming | null) => void) | null = null;
  let isClosed = false;
  let opened: (() => void) | null = null;
  const openPromise = new Promise<void>((resolve) => {
    opened = resolve;
  });

  function deliver(item: Incoming | null): void {
    if (waiter !== null) {
      const resolve = waiter;
      waiter = null;
      resolve(item);
    } else if (item !== null) queue.push(item);
  }

  socket.addEventListener("open", () => opened?.());
  socket.addEventListener("message", (event) => {
    const data = event.data;
    if (typeof data === "string") {
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        return;
      }
      if (typeof value === "object" && value !== null && (value as { op?: unknown }).op !== "pong") deliver({ kind: "json", value: value as Record<string, unknown> });
      return;
    }
    if (data instanceof ArrayBuffer) deliver({ kind: "binary", bytes: new Uint8Array(data) });
    else if (ArrayBuffer.isView(data)) deliver({ kind: "binary", bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice() });
  });
  const onEnd = () => {
    isClosed = true;
    opened?.();
    deliver(null);
  };
  socket.addEventListener("close", onEnd);
  socket.addEventListener("error", onEnd);

  function close(): void {
    if (isClosed) return;
    isClosed = true;
    try {
      socket.close();
    } catch {
      // Already closing: nothing else to release.
    }
  }

  async function next(): Promise<Incoming | null> {
    const queued = queue.shift();
    if (queued !== undefined) return queued;
    if (isClosed) return null;
    return new Promise<Incoming | null>((resolve) => {
      const timer = setTimeout(() => {
        waiter = null;
        close();
        resolve(null);
      }, timeoutMs);
      waiter = (item) => {
        clearTimeout(timer);
        resolve(item);
      };
    });
  }

  /** The next JSON answer that is not a push or `ready` (those may arrive at any time after `ready`). */
  async function nextAnswer(): Promise<Record<string, unknown> | null> {
    for (;;) {
      const item = await next();
      if (item === null) return null;
      if (item.kind === "binary") continue;
      if (item.value.op === "push" || item.value.op === "ready") continue;
      return item.value;
    }
  }

  const openTimer = setTimeout(() => close(), timeoutMs);
  await openPromise;
  clearTimeout(openTimer);
  if (isClosed) return toSourceFailure("source.unavailable");
  socket.send(
    JSON.stringify({
      op: "init",
      token: input.token,
      id: input.vaultId,
      keyhash: input.keyHash,
      version: input.version,
      initial: input.version === 0,
      device: SYNC_DEVICE_NAME,
      encryption_version: input.encryptionVersion,
    }),
  );
  const greeting = await next();
  if (greeting === null || greeting.kind !== "json") {
    close();
    return toSourceFailure("source.unavailable");
  }
  if (greeting.value.res !== "ok") {
    close();
    // A refused token or key: the account must connect again. Anything else unreadable.
    return toSourceFailure(greeting.value.res === "err" || greeting.value.status === "err" ? "source.disconnected" : "source.unexpected");
  }
  const pushes: SyncPush[] = [];
  let version: number | null = null;
  while (version === null) {
    const item = await next();
    if (item === null) {
      close();
      return toSourceFailure("source.unavailable");
    }
    if (item.kind === "binary") continue;
    if (item.value.op === "ready") {
      version = typeof item.value.version === "number" ? item.value.version : input.version;
      break;
    }
    const push = pushMessage.safeParse(item.value);
    if (!push.success) continue;
    pushes.push({ uid: push.data.uid, path: push.data.path, folder: push.data.folder ?? false, deleted: push.data.deleted ?? false, size: push.data.size ?? 0 });
  }

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  function touch(): void {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(close, idleMs);
    (idleTimer as { unref?: () => void }).unref?.();
  }
  touch();

  let pulling: Promise<unknown> = Promise.resolve();
  async function pullOne(uid: number, maxBytes: number): Promise<SourceResult<Uint8Array>> {
    if (isClosed) return toSourceFailure("source.unavailable");
    touch();
    socket.send(JSON.stringify({ op: "pull", uid }));
    const answer = await nextAnswer();
    if (answer === null) return toSourceFailure("source.unavailable");
    if (typeof answer.err === "string" || answer.res === "err") return toSourceFailure("source.not_found");
    const header = pullHeader.safeParse(answer);
    if (!header.success) return toSourceFailure("source.unexpected");
    if (header.data.deleted === true) return toSourceFailure("source.not_found");
    const tooLarge = header.data.size > maxBytes;
    const bytes = new Uint8Array(tooLarge ? 0 : header.data.size);
    let offset = 0;
    for (let piece = 0; piece < header.data.pieces; piece++) {
      const item = await next();
      if (item === null) return toSourceFailure("source.unavailable");
      if (item.kind !== "binary") return toSourceFailure("source.unexpected");
      if (tooLarge) continue;
      if (offset + item.bytes.byteLength > bytes.byteLength) return toSourceFailure("source.unexpected");
      bytes.set(item.bytes, offset);
      offset += item.bytes.byteLength;
    }
    touch();
    if (tooLarge) return toSourceFailure("source.too_large");
    return offset === bytes.byteLength ? ok(bytes) : toSourceFailure("source.unexpected");
  }

  return ok({
    version,
    pushes,
    // Pulls answer in order on one socket, so they run one at a time.
    pull(uid, maxBytes) {
      const result = pulling.then(() => pullOne(uid, maxBytes));
      pulling = result.catch(() => undefined);
      return result;
    },
    close() {
      if (idleTimer !== null) clearTimeout(idleTimer);
      close();
    },
  });
}

// A fake of the note app's sync service for tests: its account API (sign-in, sign-out, the vault list, the key check)
// and its sync socket (init, the pushes since a version, `ready`, pulls in 2 MiB pieces), holding fictional vaults
// encrypted exactly as the clients encrypt them (`sync-crypto.ts`). One vault may use managed ("standard") encryption,
// whose password the list hands to the signed-in account, another end-to-end encryption, whose password only the test
// knows. The HTTP part answers `/<api host>/<path>` and `/<path>`; the socket part is transport-free, so unit tests
// drive it in memory and the end-to-end fake (`e2e/fake-services.mjs`) puts it behind a WebSocket server.
import { createVaultCipher, deriveVaultKey, type EncryptionVersion, type VaultCipher } from "../sources/headless-sync/sync-crypto.ts";

export interface FakeSyncVault {
  readonly id: string;
  readonly name: string;
  readonly encryption: "standard" | "e2ee";
  /** The vault's encryption password: handed out for `standard`, known only to the test for `e2ee`. */
  readonly password: string;
  readonly salt: string;
  readonly encryptionVersion: EncryptionVersion;
}

export interface FakeHeadlessSyncOptions {
  readonly email: string;
  readonly password: string;
  /** When set, sign-in asks for this one-time code. */
  readonly mfaCode?: string;
  readonly vaults: readonly FakeSyncVault[];
  /** `host[:port]` the list names for every vault's socket. */
  readonly socketHost: string;
}

/** The server side of one socket. */
export interface FakeSocketPeer {
  send(data: string | Uint8Array): void;
  close(): void;
}

export interface FakeSocketSession {
  receive(data: string | Uint8Array): Promise<void>;
}

interface StoredRecord {
  readonly uid: number;
  /** Encrypted, hex. */
  readonly path: string;
  readonly plainPath: string;
  readonly hash: string;
  readonly folder: boolean;
  readonly deleted: boolean;
  readonly content: Uint8Array;
  readonly mtime: number;
}

const PIECE_BYTES = 2 * 1024 * 1024;

export interface FakeHeadlessSync {
  handle(request: Request): Promise<Response>;
  connect(peer: FakeSocketPeer): FakeSocketSession;
  write(vaultId: string, path: string, text: string): Promise<void>;
  remove(vaultId: string, path: string): Promise<void>;
  /** Live tokens; sign-out removes one. */
  readonly tokens: ReadonlySet<string>;
  /** Every socket's `init` and `pull`, for assertions (tokens left out). */
  readonly socketLog: readonly string[];
  /** Ends a session at the service, as the account signing it out elsewhere would. */
  signOut(token: string): Promise<void>;
  /** Makes the next socket opens fail before `init` answers (an outage). */
  setUnavailable(isUnavailable: boolean): void;
}

export function createFakeHeadlessSync(options: FakeHeadlessSyncOptions): FakeHeadlessSync {
  const tokens = new Set<string>();
  const socketLog: string[] = [];
  const records = new Map<string, StoredRecord[]>();
  const ciphers = new Map<string, Promise<VaultCipher>>();
  let nextUid = 1;
  let isUnavailable = false;
  /** Writes in order; every answer waits for those already started, so a test may write without awaiting. */
  let pending: Promise<void> = Promise.resolve();

  function getCipher(vault: FakeSyncVault): Promise<VaultCipher> {
    let cipher = ciphers.get(vault.id);
    if (cipher === undefined) {
      cipher = deriveVaultKey(vault.password, vault.salt).then((key) => createVaultCipher(key, vault.salt, vault.encryptionVersion));
      ciphers.set(vault.id, cipher);
    }
    return cipher;
  }

  function findVault(id: string): FakeSyncVault {
    const vault = options.vaults.find((candidate) => candidate.id === id);
    if (vault === undefined) throw new Error(`fake headless sync: no vault ${id}`);
    return vault;
  }

  async function append(vaultId: string, path: string, text: string | null): Promise<void> {
    const cipher = await getCipher(findVault(vaultId));
    const plain = new TextEncoder().encode(text ?? "");
    const list = records.get(vaultId) ?? [];
    list.push({
      uid: nextUid++,
      path: await cipher.encryptString(path),
      plainPath: path,
      hash: text === null ? "" : await cipher.encryptString(`hash-${nextUid}`),
      folder: false,
      deleted: text === null,
      content: text === null ? new Uint8Array(0) : await cipher.encryptContent(plain),
      mtime: 1_763_000_000_000 + nextUid,
    });
    records.set(vaultId, list);
  }

  /** The newest record of each path with a uid above `version`, oldest first. */
  function listSince(vaultId: string, version: number): StoredRecord[] {
    const latest = new Map<string, StoredRecord>();
    for (const record of records.get(vaultId) ?? []) latest.set(record.plainPath, record);
    return [...latest.values()].filter((record) => record.uid > version).sort((a, b) => a.uid - b.uid);
  }

  async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    const path = new URL(request.url).pathname.replace(/^\/api\.[a-z.]+/, "");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid request" });
    }
    if (path === "/user/signin") {
      if (body.email !== options.email || body.password !== options.password) return json({ error: "Login failed, incorrect email or password." });
      if (options.mfaCode !== undefined && body.mfa !== options.mfaCode) {
        return json({ error: body.mfa === "" || body.mfa === undefined ? "Please enter your 2FA code." : "2FA code is incorrect." });
      }
      const token = `fake-sync-token-${tokens.size + 1}-${Math.random().toString(36).slice(2)}`;
      tokens.add(token);
      return json({ token, name: "Fictional Person", email: options.email });
    }
    const token = typeof body.token === "string" ? body.token : "";
    if (!tokens.has(token)) return json({ error: "Not logged in" });
    if (path === "/user/signout") {
      tokens.delete(token);
      return json({});
    }
    if (path === "/user/info") return json({ name: "Fictional Person", email: options.email });
    if (path === "/vault/list") {
      return json({
        vaults: options.vaults.map((vault) => ({
          id: vault.id,
          name: vault.name,
          host: options.socketHost,
          salt: vault.salt,
          encryption_version: vault.encryptionVersion,
          ...(vault.encryption === "standard" ? { password: vault.password } : {}),
          size: 0,
          region: "eu",
        })),
        shared: [],
      });
    }
    if (path === "/vault/access") {
      const vault = options.vaults.find((candidate) => candidate.id === body.vault_uid);
      if (vault === undefined) return json({ error: "Vault not found." });
      const cipher = await getCipher(vault);
      return body.keyhash === cipher.keyHash ? json({}) : json({ error: "Invalid encryption password." });
    }
    return json({ error: "Not found" }, 404);
  }

  function connect(peer: FakeSocketPeer): FakeSocketSession {
    let vault: FakeSyncVault | null = null;
    let isReady = false;
    if (isUnavailable) {
      queueMicrotask(() => peer.close());
    }
    return {
      async receive(data) {
        await pending;
        if (typeof data !== "string") return;
        const message = JSON.parse(data) as Record<string, unknown>;
        if (message.op === "ping") {
          peer.send(JSON.stringify({ op: "pong" }));
          return;
        }
        if (!isReady) {
          socketLog.push(`init ${String(message.id)} version=${String(message.version)}`);
          if (message.op !== "init" || typeof message.token !== "string" || !tokens.has(message.token)) {
            peer.send(JSON.stringify({ res: "err", msg: "Not logged in" }));
            peer.close();
            return;
          }
          const found = options.vaults.find((candidate) => candidate.id === message.id);
          if (found === undefined || message.keyhash !== (await getCipher(found)).keyHash) {
            peer.send(JSON.stringify({ res: "err", msg: "Invalid encryption key" }));
            peer.close();
            return;
          }
          vault = found;
          isReady = true;
          peer.send(JSON.stringify({ res: "ok", perFileMax: 208_666_624, userId: "fake-user" }));
          const since = typeof message.version === "number" ? message.version : 0;
          const pushes = listSince(found.id, since);
          for (const record of pushes) {
            peer.send(
              JSON.stringify({
                op: "push",
                uid: record.uid,
                path: record.path,
                hash: record.hash,
                folder: record.folder,
                deleted: record.deleted,
                size: record.content.byteLength,
                ctime: record.mtime,
                mtime: record.mtime,
                device: "fake",
                user: "fake-user",
              }),
            );
          }
          const latest = (records.get(found.id) ?? []).reduce((max, record) => Math.max(max, record.uid), since);
          peer.send(JSON.stringify({ op: "ready", version: latest }));
          return;
        }
        if (message.op === "pull" && vault !== null) {
          socketLog.push(`pull ${String(message.uid)}`);
          const record = (records.get(vault.id) ?? []).find((candidate) => candidate.uid === message.uid);
          if (record === undefined) {
            peer.send(JSON.stringify({ err: "File not found" }));
            return;
          }
          const pieces = Math.ceil(record.content.byteLength / PIECE_BYTES);
          peer.send(JSON.stringify({ hash: record.hash, size: record.content.byteLength, pieces, deleted: record.deleted }));
          for (let index = 0; index < pieces; index++) peer.send(record.content.slice(index * PIECE_BYTES, (index + 1) * PIECE_BYTES));
          return;
        }
        peer.send(JSON.stringify({ err: "Unsupported" }));
      },
    };
  }

  return {
    handle,
    connect,
    write(vaultId, path, text) {
      pending = pending.then(() => append(vaultId, path, text));
      return pending;
    },
    remove(vaultId, path) {
      pending = pending.then(() => append(vaultId, path, null));
      return pending;
    },
    tokens,
    socketLog,
    signOut(token) {
      tokens.delete(token);
      return Promise.resolve();
    },
    setUnavailable(value) {
      isUnavailable = value;
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A `fetch` that answers the service's API from the fake (any host), for unit tests. */
export function createFakeSyncFetch(fake: FakeHeadlessSync): (input: string | URL, init: RequestInit) => Promise<Response> {
  return (input, init) => fake.handle(new Request(typeof input === "string" ? input : input.toString(), init));
}

/** A socket factory whose sockets talk to the fake in memory, asynchronously like a network, for unit tests. */
export function createFakeSocketFactory(fake: FakeHeadlessSync, log: string[] = []): (url: string) => {
  binaryType: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: { readonly data?: unknown }) => void): void;
} {
  return (url) => {
    log.push(url);
    const listeners = new Map<string, ((event: { readonly data?: unknown }) => void)[]>();
    let isClosed = false;
    const emit = (type: string, data?: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(data === undefined ? {} : { data });
    };
    const closeBoth = () => {
      if (isClosed) return;
      isClosed = true;
      setTimeout(() => emit("close"), 0);
    };
    const session = fake.connect({
      send(data) {
        if (isClosed) return;
        const payload = typeof data === "string" ? data : data.slice().buffer;
        // Sent before the close, delivered before it, as on a network.
        setTimeout(() => emit("message", payload), 0);
      },
      close: closeBoth,
    });
    setTimeout(() => {
      if (!isClosed) emit("open");
    }, 0);
    return {
      binaryType: "blob",
      send(data) {
        if (isClosed) return;
        setTimeout(() => void session.receive(data), 0);
      },
      close: closeBoth,
      addEventListener(type, listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    };
  };
}

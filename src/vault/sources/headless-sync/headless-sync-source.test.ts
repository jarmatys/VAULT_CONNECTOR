import { describe, expect, it } from "vitest";
import { describeSourceContract } from "../../testing/source-contract.ts";
import { createFakeHeadlessSync, createFakeSocketFactory, createFakeSyncFetch, type FakeSyncVault } from "../../testing/fake-headless-sync.ts";
import { createHeadlessSyncSource } from "./headless-sync-source.ts";
import { checkVaultKey, isAllowedSocketHost, listRemoteVaults, signInToSync, signOutOfSync } from "./sync-api.ts";
import { createVaultCipher, deriveVaultKey } from "./sync-crypto.ts";

const HOST = "sync-7.obsidian.md";
const STANDARD: FakeSyncVault = { id: "vault-std", name: "Garden notes", encryption: "standard", password: "managed-fictional", salt: "salt-std", encryptionVersion: 3 };
const E2EE: FakeSyncVault = { id: "vault-e2e", name: "Private", encryption: "e2ee", password: "fictional e2e pass", salt: "salt-e2e", encryptionVersion: 2 };
const LEGACY: FakeSyncVault = { id: "vault-old", name: "Old", encryption: "e2ee", password: "legacy pass", salt: "salt-old", encryptionVersion: 0 };

function createFake(vaults: readonly FakeSyncVault[] = [STANDARD, E2EE, LEGACY], mfaCode?: string) {
  return createFakeHeadlessSync({ email: "person@example.test", password: "fictional-account-pass", vaults, socketHost: HOST, ...(mfaCode === undefined ? {} : { mfaCode }) });
}

async function signIn(fake: ReturnType<typeof createFake>): Promise<string> {
  const token = await signInToSync({ email: "person@example.test", password: "fictional-account-pass", mfaCode: "" }, { fetch: createFakeSyncFetch(fake) });
  if (!token.ok) throw new Error(`sign-in failed: ${token.error}`);
  return token.value;
}

function openSource(fake: ReturnType<typeof createFake>, input: { readonly token: string; readonly key: Uint8Array; readonly vault?: FakeSyncVault; readonly host?: string; readonly sockets?: string[]; readonly maxFileBytes?: number }) {
  const vault = input.vault ?? STANDARD;
  return createHeadlessSyncSource({
    vault: { id: vault.id, host: input.host ?? HOST, salt: vault.salt, encryptionVersion: vault.encryptionVersion },
    token: input.token,
    key: input.key,
    socketFactory: createFakeSocketFactory(fake, input.sockets),
    timeoutMs: 2000,
    ...(input.maxFileBytes === undefined ? {} : { maxFileBytes: input.maxFileBytes }),
  });
}

describeSourceContract("headless sync", (files) => {
  const fake = createFake();
  for (const [path, text] of Object.entries(files)) void fake.write(STANDARD.id, path, text);
  const token = signIn(fake);
  const key = deriveVaultKey(STANDARD.password, STANDARD.salt);
  // The contract opens adapters synchronously; this one resolves its token and key on first use.
  const lazy: { token: string; key: Uint8Array } = { token: "", key: new Uint8Array(32) };
  const ready = Promise.all([token, key]).then(([t, k]) => {
    lazy.token = t;
    lazy.key = k;
  });
  return {
    open() {
      let source: ReturnType<typeof openSource> | null = null;
      const get = async () => {
        await ready;
        source ??= openSource(fake, lazy);
        return source;
      };
      return {
        kind: "headless-sync",
        getCursor: async () => (await get()).getCursor(),
        listTree: async () => (await get()).listTree(),
        readFile: async (file) => (await get()).readFile(file),
        listChangesSince: async (cursor) => (await get()).listChangesSince(cursor),
      };
    },
    write: (path, text) => void fake.write(STANDARD.id, path, text),
    remove: (path) => void fake.remove(STANDARD.id, path),
  };
});

describe("headless sync account API", () => {
  it("signs in, asks for a 2FA code when the account has one, and refuses a wrong password", async () => {
    const fake = createFake([STANDARD], "123456");
    const fetch = createFakeSyncFetch(fake);
    const call = (password: string, mfaCode: string) => signInToSync({ email: "person@example.test", password, mfaCode }, { fetch });
    expect(await call("wrong", "")).toEqual({ ok: false, error: "vault.headless_sign_in_refused" });
    expect(await call("fictional-account-pass", "")).toEqual({ ok: false, error: "vault.headless_mfa_required" });
    expect(await call("fictional-account-pass", "000000")).toEqual({ ok: false, error: "vault.headless_mfa_refused" });
    const signedIn = await call("fictional-account-pass", "123456");
    expect(signedIn.ok).toBe(true);
    if (signedIn.ok) {
      expect(await signOutOfSync(signedIn.value, { fetch })).toBe(true);
      expect(fake.tokens.has(signedIn.value)).toBe(false);
    }
  });

  it("lists vaults with their encryption, handing out only a standard vault's managed password", async () => {
    const fake = createFake();
    const vaults = await listRemoteVaults(await signIn(fake), { fetch: createFakeSyncFetch(fake) });
    expect(vaults.ok && vaults.value.map((vault) => [vault.id, vault.encryption, vault.managedPassword, vault.encryptionVersion])).toEqual([
      ["vault-std", "standard", "managed-fictional", 3],
      ["vault-e2e", "e2ee", null, 2],
      ["vault-old", "e2ee", null, 0],
    ]);
    const refused = await listRemoteVaults("not-a-token", { fetch: createFakeSyncFetch(fake) });
    expect(refused.ok ? "ok" : refused.error).toBe("source.disconnected");
  });

  it("accepts the right key hash and refuses a key from a wrong password", async () => {
    const fake = createFake();
    const token = await signIn(fake);
    const fetch = createFakeSyncFetch(fake);
    const right = await createVaultCipher(await deriveVaultKey(E2EE.password, E2EE.salt), E2EE.salt, 2);
    const wrong = await createVaultCipher(await deriveVaultKey("guess", E2EE.salt), E2EE.salt, 2);
    const vault = { id: E2EE.id, host: HOST, encryptionVersion: 2 as const };
    expect((await checkVaultKey(token, vault, right.keyHash, { fetch })).ok).toBe(true);
    const refused = await checkVaultKey(token, vault, wrong.keyHash, { fetch });
    expect(refused.ok ? "ok" : refused.error).toBe("source.disconnected");
  });

  it("dials only subdomains of the service, and loopback only for the test fake", () => {
    expect(isAllowedSocketHost("sync-7.obsidian.md")).toBe(true);
    expect(isAllowedSocketHost("sync-7.obsidian.md:443")).toBe(true);
    expect(isAllowedSocketHost("obsidian.md.attacker.test")).toBe(false);
    expect(isAllowedSocketHost("evilobsidian.md")).toBe(false);
    expect(isAllowedSocketHost("sync.obsidian.md:8080")).toBe(false);
    expect(isAllowedSocketHost("169.254.169.254")).toBe(false);
    expect(isAllowedSocketHost("127.0.0.1:4000")).toBe(false);
    expect(isAllowedSocketHost("127.0.0.1:4000", true)).toBe(true);
  });
});

describe("headless sync adapter", () => {
  it("reads end-to-end and legacy vaults with keys derived from their passwords", async () => {
    const fake = createFake();
    const token = await signIn(fake);
    for (const vault of [E2EE, LEGACY]) {
      await fake.write(vault.id, "Journal/Tuesday — crème brûlée.md", "# Tuesday\n");
      const source = openSource(fake, { token, key: await deriveVaultKey(vault.password, vault.salt), vault });
      const listed = await source.listTree();
      expect(listed.ok && listed.value.files.map((file) => file.path)).toEqual(["Journal/Tuesday — crème brûlée.md"]);
      const file = listed.ok ? listed.value.files[0] : undefined;
      if (file === undefined) throw new Error("not listed");
      const bytes = await source.readFile(file);
      expect(bytes.ok && new TextDecoder().decode(bytes.value)).toBe("# Tuesday\n");
    }
  });

  it("leaves out deleted records and keeps the newest record of a path", async () => {
    const fake = createFake();
    await fake.write(STANDARD.id, "A.md", "one");
    await fake.write(STANDARD.id, "A.md", "two");
    await fake.write(STANDARD.id, "Gone.md", "bye");
    await fake.remove(STANDARD.id, "Gone.md");
    const source = openSource(fake, { token: await signIn(fake), key: await deriveVaultKey(STANDARD.password, STANDARD.salt) });
    const listed = await source.listTree();
    expect(listed.ok && listed.value.files.map((file) => [file.path, file.size])).toEqual([["A.md", 3]]);
  });

  it("answers disconnected for a token the service no longer accepts and for a wrong key", async () => {
    const fake = createFake();
    await fake.write(STANDARD.id, "A.md", "one");
    const key = await deriveVaultKey(STANDARD.password, STANDARD.salt);
    const stale = await openSource(fake, { token: "signed-out-token", key }).listTree();
    expect(stale.ok ? "ok" : stale.error).toBe("source.disconnected");
    const wrongKey = await openSource(fake, { token: await signIn(fake), key: await deriveVaultKey("guess", STANDARD.salt) }).listTree();
    expect(wrongKey.ok ? "ok" : wrongKey.error).toBe("source.disconnected");
  });

  it("answers unavailable when the service closes before answering, and never dials a host off the allow-list", async () => {
    const fake = createFake();
    const key = await deriveVaultKey(STANDARD.password, STANDARD.salt);
    const token = await signIn(fake);
    fake.setUnavailable(true);
    const down = await openSource(fake, { token, key }).listTree();
    expect(down.ok ? "ok" : down.error).toBe("source.unavailable");
    fake.setUnavailable(false);
    const sockets: string[] = [];
    const offList = await openSource(fake, { token, key, host: "metadata.attacker.test", sockets }).listTree();
    expect([offList.ok ? "ok" : offList.error, sockets]).toEqual(["source.unexpected", []]);
  });

  it("refuses a file over the size cap without decrypting it", async () => {
    const fake = createFake();
    await fake.write(STANDARD.id, "Big.md", "x".repeat(2000));
    const source = openSource(fake, { token: await signIn(fake), key: await deriveVaultKey(STANDARD.password, STANDARD.salt), maxFileBytes: 1000 });
    const listed = await source.listTree();
    const file = listed.ok ? listed.value.files[0] : undefined;
    if (file === undefined) throw new Error("not listed");
    expect(file.size).toBe(2000);
    const read = await source.readFile(file);
    expect(read.ok ? "ok" : read.error).toBe("source.too_large");
  });

  it("probes with one session and never pulls", async () => {
    const fake = createFake();
    await fake.write(STANDARD.id, "A.md", "one");
    const sockets: string[] = [];
    const probe = await openSource(fake, { token: await signIn(fake), key: await deriveVaultKey(STANDARD.password, STANDARD.salt), sockets }).probe();
    expect([probe.ok, sockets, fake.socketLog]).toEqual([true, [`wss://${HOST}`], ["init vault-std version=0"]]);
  });
});

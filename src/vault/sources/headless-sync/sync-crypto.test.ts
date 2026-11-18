import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVaultCipher, deriveVaultKey, fromHex, sealAesSiv, toHex } from "./sync-crypto.ts";

const bytes = (hex: string): Uint8Array => {
  const value = fromHex(hex.replace(/\s+/g, ""));
  if (value === null) throw new Error("bad hex in test");
  return value;
};

describe("sync crypto", () => {
  it("derives the vault key with scrypt N=32768, r=8, p=1 after NFKC, as node:crypto does", async () => {
    const key = await deriveVaultKey("ﬁle pässword", "vault-salt");
    const expected = scryptSync(Buffer.from("file pässword".normalize("NFKC")), Buffer.from("vault-salt"), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    expect(toHex(key)).toBe(expected.toString("hex"));
  });

  it("seals the RFC 5297 A.1 deterministic vector exactly", async () => {
    const sealed = await sealAesSiv({
      macKey: bytes("fffefdfc fbfaf9f8 f7f6f5f4 f3f2f1f0"),
      ctrKey: bytes("f0f1f2f3 f4f5f6f7 f8f9fafb fcfdfeff"),
      associatedData: [bytes("10111213 14151617 18191a1b 1c1d1e1f 20212223 24252627")],
      plain: bytes("11223344 55667788 99aabbcc ddee"),
    });
    expect(toHex(sealed)).toBe("85632d07c6e8f37f950acd320a2ecc9340c02b9690c4dc04daef7f6afe5c");
  });

  for (const version of [0, 2, 3] as const) {
    it(`round-trips names and contents under version ${version}, deterministic names, random contents`, async () => {
      const key = await deriveVaultKey("secret", "salt-1");
      const cipher = await createVaultCipher(key, "salt-1", version);
      const name = "Projects/Café über naïve — a note with a long name, longer than a few cipher blocks.md";
      const first = await cipher.encryptString(name);
      expect(await cipher.encryptString(name)).toBe(first);
      expect(await cipher.decryptString(first)).toBe(name);
      const content = new TextEncoder().encode("# Garden\nsmørrebrød\n");
      const sealed = await cipher.encryptContent(content);
      expect(sealed.byteLength).toBe(content.byteLength + 28);
      expect(toHex(await cipher.encryptContent(content))).not.toBe(toHex(sealed));
      expect(new TextDecoder().decode((await cipher.decryptContent(sealed)) ?? new Uint8Array())).toBe("# Garden\nsmørrebrød\n");
      expect((await cipher.encryptContent(new Uint8Array(0))).byteLength).toBe(0);
      expect(cipher.keyHash).toMatch(/^[0-9a-f]{64}$/);
    });
  }

  it("refuses values sealed under another key or tampered with", async () => {
    const right = await createVaultCipher(await deriveVaultKey("right", "salt"), "salt", 3);
    const wrong = await createVaultCipher(await deriveVaultKey("wrong", "salt"), "salt", 3);
    const name = await right.encryptString("Welcome.md");
    const content = await right.encryptContent(new TextEncoder().encode("hello"));
    expect(await wrong.decryptString(name)).toBeNull();
    expect(await wrong.decryptContent(content)).toBeNull();
    const flipped = content.slice();
    flipped[20] = (flipped[20] ?? 0) ^ 1;
    expect(await right.decryptContent(flipped)).toBeNull();
    expect(await right.decryptString("zz")).toBeNull();
    expect(right.keyHash).not.toBe(wrong.keyHash);
  });

  it("gives the same key hash for the same key and salt, another for another salt", async () => {
    const key = await deriveVaultKey("p", "s1");
    expect((await createVaultCipher(key, "s1", 3)).keyHash).toBe((await createVaultCipher(key, "s1", 2)).keyHash);
    expect((await createVaultCipher(key, "s1", 3)).keyHash).not.toBe((await createVaultCipher(key, "s2", 3)).keyHash);
    expect((await createVaultCipher(key, "s1", 0)).keyHash).toBe(toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", Buffer.from(key)))));
  });
});

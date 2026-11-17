// Storage keys and settings: a key names neither the account nor the note, accounts never share a prefix, and the sync
// is unconfigured until a store and a long enough secret are set.
import { createMemoryStorage } from "@softure-ai/files/testing";
import { describe, expect, it } from "vitest";
import { createAccountNoteStorage, deriveAccountPrefix, getNoteKey } from "./note-storage.ts";
import { readVaultStorageSettings } from "./storage-settings.ts";

const SECRET = "test-key-secret-0123456789abcdef0123";
const ALICE = "6f1c2a52-8a0e-4b8e-9b9e-0d5a3c1f2e01";
const BOB = "0b7d9e14-3c55-4f21-a1a2-77e0c4d9b302";

describe("note storage keys", () => {
  it("derive a 32 hex prefix per account that holds no part of the account id", () => {
    const prefix = deriveAccountPrefix(SECRET, ALICE);
    expect(prefix).toMatch(/^[0-9a-f]{32}$/);
    expect(prefix).not.toBe(deriveAccountPrefix(SECRET, BOB));
    expect(prefix).not.toBe(deriveAccountPrefix(`${SECRET}x`, ALICE));
    for (const part of ALICE.split("-")) expect(prefix).not.toContain(part);
  });

  it("hash the note path, so the key holds neither the path nor the account id", () => {
    const key = getNoteKey(deriveAccountPrefix(SECRET, ALICE), "Work/Clients/Acme.md");
    expect(key).toMatch(/^v1\/[0-9a-f]{32}\/[0-9a-f]{64}$/);
    expect(key).not.toContain("Acme");
    expect(key).not.toContain(ALICE);
    // The same text in two Unicode forms is one note.
    expect(getNoteKey("p", "Café.md")).toBe(getNoteKey("p", "Café.md"));
  });

  it("keep each account's copies apart in one store", async () => {
    const storage = createMemoryStorage();
    const alice = createAccountNoteStorage(storage, SECRET, ALICE);
    const bob = createAccountNoteStorage(storage, SECRET, BOB);
    await alice.putNote("Work/a.md", new TextEncoder().encode("alice"));
    expect(new TextDecoder().decode((await alice.readNote("Work/a.md")) ?? new Uint8Array())).toBe("alice");
    expect(await bob.readNote("Work/a.md")).toBeNull();
    await alice.deleteNote("Work/a.md");
    expect(storage.objects().size).toBe(0);
  });
});

describe("storage settings", () => {
  const S3 = {
    VAULT_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    VAULT_S3_BUCKET: "vault-copies",
    VAULT_S3_ACCESS_KEY_ID: "id",
    VAULT_S3_SECRET_ACCESS_KEY: "key",
    VAULT_STORAGE_KEY_SECRET: SECRET,
  };

  it("read an S3 bucket with the region R2 uses by default", () => {
    expect(readVaultStorageSettings(S3)).toEqual({
      kind: "configured",
      keySecret: SECRET,
      location: { kind: "s3", endpoint: S3.VAULT_S3_ENDPOINT, bucket: "vault-copies", region: "auto" },
    });
  });

  it("read a folder when no bucket is named", () => {
    expect(readVaultStorageSettings({ VAULT_STORAGE_DIR: "/data/vault", VAULT_STORAGE_KEY_SECRET: SECRET })).toEqual({
      kind: "configured",
      keySecret: SECRET,
      location: { kind: "local", dir: "/data/vault" },
    });
  });

  it("are unconfigured without a secret, with a short one, a half-set bucket or no store", () => {
    expect(readVaultStorageSettings({ ...S3, VAULT_STORAGE_KEY_SECRET: "" })).toEqual({ kind: "unconfigured" });
    expect(readVaultStorageSettings({ ...S3, VAULT_STORAGE_KEY_SECRET: "short" })).toEqual({ kind: "unconfigured" });
    expect(readVaultStorageSettings({ ...S3, VAULT_S3_SECRET_ACCESS_KEY: " " })).toEqual({ kind: "unconfigured" });
    expect(readVaultStorageSettings({ ...S3, VAULT_S3_BUCKET: "Not_A_Bucket" })).toEqual({ kind: "unconfigured" });
    expect(readVaultStorageSettings({ ...S3, VAULT_S3_ENDPOINT: "ftp://x" })).toEqual({ kind: "unconfigured" });
    expect(readVaultStorageSettings({ VAULT_STORAGE_KEY_SECRET: SECRET })).toEqual({ kind: "unconfigured" });
  });
});

// The encryption of a vault kept in the note app's own sync service, as its clients apply it, so the adapter can read
// what they wrote. Everything is encrypted on the clients before it reaches the service: file contents, paths and
// content hashes. A vault's key is derived from its encryption password and its salt with scrypt; for a vault with
// managed ("standard") encryption the service hands that password to the account's clients, for an end-to-end vault
// only the person knows it. Two schemes exist:
//
// - version 0 (legacy): the scrypt key directly; key hash = SHA-256 of the key; contents AES-256-GCM with a random
//   12-byte IV; paths and hashes AES-256-GCM with the IV taken from the SHA-256 of the plain text (deterministic);
// - versions 2 and 3 (current, same algorithm): sub-keys from HKDF-SHA-256 over the scrypt key (key hash: salt = the
//   vault salt, info `ObsidianKeyHash`; contents: empty salt, info `ObsidianAesGcm`; paths and hashes: AES-SIV,
//   RFC 5297, with a CMAC key (info `ObsidianAesSivMac`) and a CTR key (info `ObsidianAesSivEnc`), both salted with
//   the vault salt). The CTR step counts with the last 16 bits of the counter block only, as the clients do.
//
// A wire value of a content is `iv || ciphertext || tag`; of a path or a hash, the hex of that (version 0) or of
// `siv || ciphertext` (versions 2, 3). Only Web Crypto and a pure scrypt are used, so the same code runs on Node, on
// Workers and in the browser (where an end-to-end vault's key is derived, so its password never leaves the browser).
import { scryptAsync } from "@noble/hashes/scrypt.js";

/** The encryption versions the adapter reads. */
export const ENCRYPTION_VERSIONS = [0, 2, 3] as const;
export type EncryptionVersion = (typeof ENCRYPTION_VERSIONS)[number];

/** The newest version the adapter declares to the service. */
export const SUPPORTED_ENCRYPTION_VERSION = 3;

/** Bytes of a vault key. */
export const VAULT_KEY_BYTES = 32;

/** scrypt's cost as the clients use it: N = 2^15, r = 8, p = 1. */
const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, dkLen: VAULT_KEY_BYTES } as const;

const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
/** What encryption adds to a non-empty content: the IV and the GCM tag. */
export const CONTENT_OVERHEAD_BYTES = IV_BYTES + GCM_TAG_BYTES;
const BLOCK = 16;

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

export function isEncryptionVersion(value: unknown): value is EncryptionVersion {
  return value === 0 || value === 2 || value === 3;
}

/** The vault key from its encryption password and salt (both NFKC-normalised first, as the clients do). */
export async function deriveVaultKey(password: string, salt: string): Promise<Uint8Array> {
  return scryptAsync(encoder.encode(password.normalize("NFKC")), encoder.encode(salt.normalize("NFKC")), SCRYPT_PARAMS);
}

/** Reads (and, for the tests' fake service, writes) one vault's encrypted names and contents. */
export interface VaultCipher {
  readonly encryptionVersion: EncryptionVersion;
  /** Hex; proves to the service that the client holds the right key, without the key. */
  readonly keyHash: string;
  decryptString(hex: string): Promise<string | null>;
  decryptContent(bytes: Uint8Array): Promise<Uint8Array | null>;
  encryptString(text: string): Promise<string>;
  encryptContent(bytes: Uint8Array): Promise<Uint8Array>;
}

/** The cipher of a vault; throws only on a key of the wrong length (a bug: keys are checked where they enter). */
export async function createVaultCipher(key: Uint8Array, salt: string, version: EncryptionVersion): Promise<VaultCipher> {
  if (key.byteLength !== VAULT_KEY_BYTES) throw new Error(`Creating a vault cipher: the key has ${key.byteLength} bytes, not ${VAULT_KEY_BYTES}`);
  return version === 0 ? createLegacyCipher(key) : createSivCipher(key, salt, version);
}

/** The key hash alone, for checking a key against the service before anything is stored. */
export async function computeKeyHash(key: Uint8Array, salt: string, version: EncryptionVersion): Promise<string> {
  return (await createVaultCipher(key, salt, version)).keyHash;
}

async function createLegacyCipher(key: Uint8Array): Promise<VaultCipher> {
  const gcmKey = await subtle.importKey("raw", toBuffer(key), "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    encryptionVersion: 0,
    keyHash: toHex(new Uint8Array(await subtle.digest("SHA-256", toBuffer(key)))),
    async decryptString(hex) {
      const bytes = fromHex(hex);
      if (bytes === null) return null;
      const plain = await openGcm(gcmKey, bytes);
      return plain === null ? null : decodeUtf8(plain);
    },
    decryptContent: (bytes) => openGcm(gcmKey, bytes),
    async encryptString(text) {
      const plain = encoder.encode(text);
      const iv = new Uint8Array(await subtle.digest("SHA-256", toBuffer(plain))).slice(0, IV_BYTES);
      return toHex(await sealGcm(gcmKey, plain, iv));
    },
    encryptContent: (bytes) => sealGcm(gcmKey, bytes, globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))),
  };
}

async function createSivCipher(key: Uint8Array, salt: string, version: 2 | 3): Promise<VaultCipher> {
  const base = await subtle.importKey("raw", toBuffer(key), "HKDF", false, ["deriveKey"]);
  const saltBytes = toBuffer(encoder.encode(salt));
  const derive = (info: string, hkdfSalt: ArrayBuffer, algorithm: "AES-CBC" | "AES-CTR" | "AES-GCM", usages: KeyUsage[], extractable = false) =>
    subtle.deriveKey({ name: "HKDF", salt: hkdfSalt, info: toBuffer(encoder.encode(info)), hash: "SHA-256" }, base, { name: algorithm, length: 256 }, extractable, usages);
  const keyHashKey = await derive("ObsidianKeyHash", saltBytes, "AES-CBC", ["encrypt"], true);
  const gcmKey = await derive("ObsidianAesGcm", new ArrayBuffer(0), "AES-GCM", ["encrypt", "decrypt"]);
  const macKey = await derive("ObsidianAesSivMac", saltBytes, "AES-CBC", ["encrypt"]);
  const ctrKey = await derive("ObsidianAesSivEnc", saltBytes, "AES-CTR", ["encrypt"]);
  const siv = createSiv(macKey, ctrKey);
  return {
    encryptionVersion: version,
    keyHash: toHex(new Uint8Array(await subtle.exportKey("raw", keyHashKey))),
    async decryptString(hex) {
      const bytes = fromHex(hex);
      if (bytes === null) return null;
      const plain = await siv.open(bytes);
      return plain === null ? null : decodeUtf8(plain);
    },
    decryptContent: (bytes) => openGcm(gcmKey, bytes),
    async encryptString(text) {
      return toHex(await siv.seal(encoder.encode(text)));
    },
    encryptContent: (bytes) => sealGcm(gcmKey, bytes, globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))),
  };
}

async function sealGcm(key: CryptoKey, plain: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  if (plain.byteLength === 0) return new Uint8Array(0);
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: toBuffer(iv) }, key, toBuffer(plain)));
  const out = new Uint8Array(IV_BYTES + sealed.byteLength);
  out.set(iv, 0);
  out.set(sealed, IV_BYTES);
  return out;
}

/** The plain bytes, an empty content as empty, or null when the value does not open under the key. */
async function openGcm(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes.byteLength === 0) return new Uint8Array(0);
  if (bytes.byteLength < CONTENT_OVERHEAD_BYTES) return null;
  try {
    const iv = toBuffer(bytes.subarray(0, IV_BYTES));
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv }, key, toBuffer(bytes.subarray(IV_BYTES))));
  } catch {
    // A wrong key or a tampered value: the tag does not match. The caller names the failure.
    return null;
  }
}

interface Siv {
  seal(plain: Uint8Array, associatedData?: readonly Uint8Array[]): Promise<Uint8Array>;
  open(sealed: Uint8Array): Promise<Uint8Array | null>;
}

/** AES-SIV (RFC 5297) with no associated data, over Web Crypto: CMAC from single-block AES-CBC, CTR as the clients count. */
function createSiv(macKey: CryptoKey, ctrKey: CryptoKey): Siv {
  async function encryptBlock(block: Uint8Array): Promise<Uint8Array> {
    // CBC with a zero IV over one block is the block cipher itself; the second output block is padding.
    return new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv: new ArrayBuffer(BLOCK) }, macKey, toBuffer(block))).slice(0, BLOCK);
  }

  async function cmac(message: Uint8Array): Promise<Uint8Array> {
    const l = await encryptBlock(new Uint8Array(BLOCK));
    const k1 = double(l);
    const k2 = double(k1);
    const blockCount = Math.max(1, Math.ceil(message.byteLength / BLOCK));
    const isComplete = message.byteLength > 0 && message.byteLength % BLOCK === 0;
    const last = new Uint8Array(BLOCK);
    const tail = message.subarray((blockCount - 1) * BLOCK);
    last.set(tail);
    if (isComplete) xorInto(last, k1);
    else {
      last[tail.byteLength] = 0x80;
      xorInto(last, k2);
    }
    let state: Uint8Array = new Uint8Array(BLOCK);
    for (let index = 0; index < blockCount - 1; index++) {
      xorInto(state, message.subarray(index * BLOCK, (index + 1) * BLOCK));
      state = await encryptBlock(state);
    }
    xorInto(state, last);
    return encryptBlock(state);
  }

  async function s2v(plain: Uint8Array, associatedData: readonly Uint8Array[]): Promise<Uint8Array> {
    let d = await cmac(new Uint8Array(BLOCK));
    for (const component of associatedData) {
      d = double(d);
      xorInto(d, await cmac(component));
    }
    if (plain.byteLength >= BLOCK) {
      const t = plain.slice();
      xorInto(t.subarray(t.byteLength - BLOCK), d);
      return cmac(t);
    }
    const padded = new Uint8Array(BLOCK);
    padded.set(plain);
    padded[plain.byteLength] = 0x80;
    xorInto(padded, double(d));
    return cmac(padded);
  }

  async function ctr(iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const counter = iv.slice();
    counter[counter.byteLength - 8] = (counter[counter.byteLength - 8] ?? 0) & 0x7f;
    counter[counter.byteLength - 4] = (counter[counter.byteLength - 4] ?? 0) & 0x7f;
    return new Uint8Array(await subtle.encrypt({ name: "AES-CTR", counter: toBuffer(counter), length: 16 }, ctrKey, toBuffer(data)));
  }

  return {
    async seal(plain, associatedData = []) {
      const v = await s2v(plain, associatedData);
      const out = new Uint8Array(BLOCK + plain.byteLength);
      out.set(v, 0);
      out.set(await ctr(v, plain), BLOCK);
      return out;
    },
    async open(sealed) {
      if (sealed.byteLength < BLOCK) return null;
      const v = sealed.slice(0, BLOCK);
      const plain = await ctr(v, sealed.subarray(BLOCK));
      return isEqualConstantTime(await s2v(plain, []), v) ? plain : null;
    },
  };
}

/** AES-SIV over raw keys, for the RFC 5297 vectors in the tests; the vault paths use no associated data. */
export async function sealAesSiv(input: { readonly macKey: Uint8Array; readonly ctrKey: Uint8Array; readonly plain: Uint8Array; readonly associatedData: readonly Uint8Array[] }): Promise<Uint8Array> {
  const macKey = await subtle.importKey("raw", toBuffer(input.macKey), "AES-CBC", false, ["encrypt"]);
  const ctrKey = await subtle.importKey("raw", toBuffer(input.ctrKey), "AES-CTR", false, ["encrypt"]);
  return createSiv(macKey, ctrKey).seal(input.plain, input.associatedData);
}

/** Doubling in GF(2^128), as CMAC and S2V define it. */
function double(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK);
  let carry = 0;
  for (let index = BLOCK - 1; index >= 0; index--) {
    const byte = block[index] ?? 0;
    out[index] = ((byte << 1) | carry) & 0xff;
    carry = byte >>> 7;
  }
  if (carry === 1) out[BLOCK - 1] = (out[BLOCK - 1] ?? 0) ^ 0x87;
  return out;
}

function xorInto(target: Uint8Array, source: Uint8Array): void {
  for (let index = 0; index < source.byteLength; index++) target[index] = (target[index] ?? 0) ^ (source[index] ?? 0);
}

function isEqualConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < a.byteLength; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** The bytes of an even-length hex string, or null when it is not one. */
export function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.byteLength; index++) out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return out;
}

/** A copy as a plain ArrayBuffer, which Web Crypto's typings ask for. */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

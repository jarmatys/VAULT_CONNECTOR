// The synced copies in object storage. Every account's notes live under its own prefix, an HMAC-SHA256 of the account
// id under the key secret, and every note under the SHA-256 of its path: a key names neither the account nor the note
// (NFR-4), and without the secret nobody maps a prefix back to an account. A new version overwrites the same key.
import { createHash, createHmac } from "node:crypto";
import type { FileStorage } from "@softure-ai/files";

/** The key layout's version: a later layout writes under another one and leaves these readable. */
export const NOTE_KEY_VERSION = "v1";

/** The account's prefix: 32 hex characters (128 bits) of the HMAC, enough to never collide between accounts. */
export function deriveAccountPrefix(keySecret: string, userId: string): string {
  return createHmac("sha256", keySecret).update(`vault-account:${userId}`).digest("hex").slice(0, 32);
}

/** The object key of one note of an account. */
export function getNoteKey(accountPrefix: string, path: string): string {
  const pathHash = createHash("sha256").update(path.normalize("NFC")).digest("hex");
  return `${NOTE_KEY_VERSION}/${accountPrefix}/${pathHash}`;
}

/** One account's view of the store: it can reach only keys under its own prefix. */
export interface AccountNoteStorage {
  readonly prefix: string;
  putNote(path: string, bytes: Uint8Array): Promise<void>;
  /** The note's bytes, or null when no copy exists. */
  readNote(path: string): Promise<Uint8Array | null>;
  deleteNote(path: string): Promise<void>;
}

export function createAccountNoteStorage(storage: FileStorage, keySecret: string, userId: string): AccountNoteStorage {
  const prefix = deriveAccountPrefix(keySecret, userId);
  return {
    prefix,
    async putNote(path, bytes) {
      await storage.put(toBody(bytes), getNoteKey(prefix, path));
    },
    async readNote(path) {
      const stream = await storage.get(getNoteKey(prefix, path));
      return stream === null ? null : new Uint8Array(await new Response(stream).arrayBuffer());
    },
    async deleteNote(path) {
      await storage.delete(getNoteKey(prefix, path));
    },
  };
}

/** One chunk as the store's body; a plain iterator, since nothing in it awaits. */
function toBody(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let sent = false;
      return {
        next: (): Promise<IteratorResult<Uint8Array>> => {
          const result: IteratorResult<Uint8Array> = sent ? { done: true, value: undefined } : { done: false, value: bytes };
          sent = true;
          return Promise.resolve(result);
        },
      };
    },
  };
}

// One step of an account's indexing, small enough for the background budget: at most `maxNotes` pending notes (fewer
// when `maxMs` runs out while reading), their passages embedded in one call to the model (the model batches it), then
// each note's passages replaced on its own. Another step is enqueued while pending notes remain. A failed embedding
// call writes nothing, records its code for the panel and asks the queue to retry later; a step repeated after a crash
// redoes at most the notes it had not written.
import type { Clock, ErrorCode } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import type { Embedder } from "@softure-ai/llm";
import { createAccountNoteStorage } from "../storage/note-storage.ts";
import { foldForSearch } from "./fold-for-search.ts";
import { clearIndexFailure, listPendingNotes, recordIndexFailure, replaceNotePassages, type IndexedPassage, type PendingNote } from "./index-store.ts";
import { describePassage, splitIntoPassages, type Passage } from "./split-into-passages.ts";

export interface IndexLimits {
  /** Notes one step indexes at most. */
  readonly maxNotes: number;
  /** A step reads no further note after this long. */
  readonly maxMs: number;
  /** How long to wait before retrying after the model failed. */
  readonly retryAfterSeconds: number;
}

export const DEFAULT_INDEX_LIMITS: IndexLimits = { maxNotes: 20, maxMs: 20_000, retryAfterSeconds: 300 };

/** The model id stored with a keyword-only index. */
export const KEYWORD_ONLY_MODEL = "";

export interface IndexContext {
  readonly db: Queryable;
  readonly clock: Clock;
  readonly storage: FileStorage;
  readonly keySecret: string;
  /** Null: keyword-only index (no embedding model on this instance). */
  readonly embedder: Embedder | null;
  /** Enqueues the account's next step. */
  readonly continueIndex: (userId: string) => Promise<void>;
  readonly limits?: Partial<IndexLimits>;
}

export type IndexStepResult =
  | { readonly kind: "idle" }
  | { readonly kind: "indexed"; readonly notes: number; readonly continued: boolean }
  /** The embedding model failed; nothing was written. */
  | { readonly kind: "retry"; readonly error: ErrorCode; readonly retryAfterSeconds: number };

interface ReadNote {
  readonly note: PendingNote;
  readonly passages: readonly Passage[];
}

export async function runIndexStep(ctx: IndexContext, input: { readonly userId: string }): Promise<IndexStepResult> {
  const limits = { ...DEFAULT_INDEX_LIMITS, ...ctx.limits };
  const model = ctx.embedder?.modelId ?? KEYWORD_ONLY_MODEL;
  const pending = await listPendingNotes(ctx.db, { userId: input.userId, model, limit: limits.maxNotes });
  if (pending.length === 0) {
    await clearIndexFailure(ctx.db, input.userId);
    return { kind: "idle" };
  }
  const read = await readNotes(ctx, input.userId, pending, limits.maxMs);
  const texts = read.flatMap((entry) => entry.passages.map((passage) => describePassage(entry.note.title, passage)));
  let vectors: readonly (readonly number[])[] | null = null;
  if (ctx.embedder !== null && texts.length > 0) {
    const embedded = await ctx.embedder.embedTexts({ values: texts, attributes: { userId: input.userId } });
    if (!embedded.ok) {
      await recordIndexFailure(ctx.db, { userId: input.userId, errorCode: embedded.error, now: ctx.clock.now() });
      return { kind: "retry", error: embedded.error, retryAfterSeconds: limits.retryAfterSeconds };
    }
    vectors = embedded.value.embeddings;
  }
  let offset = 0;
  for (const entry of read) {
    const passages = entry.passages.map((passage, index): IndexedPassage => ({
      ordinal: passage.ordinal,
      heading: passage.heading,
      body: passage.body,
      searchText: foldForSearch(describePassage(entry.note.title, passage)),
      embedding: vectors?.[offset + index] ?? null,
    }));
    offset += entry.passages.length;
    await replaceNotePassages(ctx.db, { userId: input.userId, path: entry.note.path, version: entry.note.version, model, passages, now: ctx.clock.now() });
  }
  await clearIndexFailure(ctx.db, input.userId);
  const continued = pending.length === limits.maxNotes || read.length < pending.length;
  if (continued) await ctx.continueIndex(input.userId);
  return { kind: "indexed", notes: read.length, continued };
}

/** Reads and splits the notes in order, stopping before a note once `maxMs` has passed (always at least one). */
async function readNotes(ctx: IndexContext, userId: string, pending: readonly PendingNote[], maxMs: number): Promise<ReadNote[]> {
  const storage = createAccountNoteStorage(ctx.storage, ctx.keySecret, userId);
  const startedAt = ctx.clock.now().getTime();
  const read: ReadNote[] = [];
  for (const note of pending) {
    if (read.length > 0 && ctx.clock.now().getTime() - startedAt >= maxMs) break;
    const bytes = await storage.readNote(note.path);
    // A copy missing from the store is indexed as empty; the next sync writes it again and changes its version.
    const text = bytes === null ? "" : new TextDecoder().decode(bytes);
    read.push({ note, passages: splitIntoPassages(text) });
  }
  return read;
}

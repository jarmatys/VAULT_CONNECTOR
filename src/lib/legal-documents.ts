// The app's legal documents and their change history, in the input shape of `privacy({ documents })` from
// `@softure-ai/privacy`. `softure.config.ts` registers the privacy module with this same array, so
// the version a consent records is the version the page shows. Changing the text of a document means a new history
// entry here, dated the day the new text takes effect.
import type { LegalDocumentDeclaration } from "@softure-ai/privacy";

export type LegalDocumentId = "privacy-policy" | "terms";

/** One published text: the day it takes effect (`YYYY-MM-DD`, also its version) and what changed. */
export interface LegalRevisionInput {
  readonly date: string;
  readonly summary: string;
}

export interface LegalDocumentInput {
  readonly id: LegalDocumentId;
  readonly history: readonly LegalRevisionInput[];
}

export const LEGAL_DOCUMENTS = [
  {
    id: "privacy-policy",
    history: [
      { date: "2026-11-17", summary: "First version." },
      { date: "2026-11-18", summary: "Names where the meaning data of notes and of search queries is computed: Cloudflare Workers AI." },
    ],
  },
  { id: "terms", history: [{ date: "2026-11-17", summary: "First version." }] },
] as const satisfies readonly LegalDocumentInput[];

/** Where each document is published. */
export const LEGAL_PATHS: Readonly<Record<LegalDocumentId, string>> = {
  "privacy-policy": "/privacy",
  terms: "/terms",
};

/**
 * The declaration `LegalDocument` renders, as the privacy module would normalise it: the history newest first, each
 * version the entry's date, and the version in force the newest one.
 */
export function getLegalDocument(id: LegalDocumentId, documents: readonly LegalDocumentInput[] = LEGAL_DOCUMENTS): LegalDocumentDeclaration {
  const input = documents.find((document) => document.id === id);
  if (input === undefined || input.history.length === 0) {
    throw new Error(`getLegalDocument: no published text for the legal document "${id}"`);
  }
  const history = [...input.history]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((revision) => ({ version: revision.date, date: revision.date, summary: revision.summary }));
  // The emptiness check above guarantees a newest entry.
  const newest = history[0] as (typeof history)[number];
  return { id, version: newest.version, history };
}

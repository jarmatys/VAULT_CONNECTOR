// Search over an account's passages: by words (the folded query's prefixes against the passages' tsvector, with a
// trigram fallback for typos when words find little) and by meaning (the query's vector against the passages'
// vectors, scanned exactly within the account), merged by reciprocal rank fusion so a passage that both find ranks
// first. Without an embedder, or when the model fails, the search is by words only. VC-11's search tool builds on it.
import type { Queryable } from "@softure-ai/db";
import type { Embedder } from "@softure-ai/llm";
import { sql } from "drizzle-orm";
import { buildKeywordQuery, foldForSearch } from "./fold-for-search.ts";
import { toVectorLiteral } from "./index-store.ts";

export interface PassageHit {
  readonly path: string;
  readonly ordinal: number;
  readonly heading: string;
  readonly body: string;
  /** The fused score; higher is better. */
  readonly score: number;
}

export interface SearchPassagesInput {
  readonly userId: string;
  readonly query: string;
  /** Null: by words only. */
  readonly embedder: Embedder | null;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 10;
/** Hits taken from each ranking before they are merged. */
const CANDIDATES = 50;
/** Reciprocal rank fusion's damping constant (the usual 60). */
const RRF_K = 60;
/** Below this many word hits the trigram fallback joins in. */
const FEW_WORD_HITS = 5;
const TRIGRAM_THRESHOLD = 0.5;

type RankedRow = { path: string; ordinal: number; heading: string; body: string };

export async function searchPassages(db: Queryable, input: SearchPassagesInput): Promise<PassageHit[]> {
  const rankings: RankedRow[][] = [];
  const keywordQuery = buildKeywordQuery(input.query);
  if (keywordQuery !== null) {
    const byWords = await rankByWords(db, input.userId, keywordQuery);
    rankings.push(byWords);
    if (byWords.length < FEW_WORD_HITS) rankings.push(await rankBySimilarity(db, input.userId, foldForSearch(input.query)));
  }
  if (input.embedder !== null && input.query.trim() !== "") {
    const embedded = await input.embedder.embedTexts({ values: [input.query.trim()], attributes: { userId: input.userId } });
    const vector = embedded.ok ? embedded.value.embeddings[0] : undefined;
    if (vector !== undefined) rankings.push(await rankByMeaning(db, input.userId, vector));
  }
  return fuseRankings(rankings).slice(0, input.limit ?? DEFAULT_LIMIT);
}

/** Reciprocal rank fusion: each ranking adds 1 / (60 + rank) to a passage. */
export function fuseRankings(rankings: readonly (readonly RankedRow[])[]): PassageHit[] {
  const hits = new Map<string, { row: RankedRow; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((row, rank) => {
      const key = `${row.path}\u0000${String(row.ordinal)}`;
      const entry = hits.get(key) ?? { row, score: 0 };
      entry.score += 1 / (RRF_K + rank + 1);
      hits.set(key, entry);
    });
  }
  return [...hits.values()]
    .sort((left, right) => right.score - left.score || left.row.path.localeCompare(right.row.path) || left.row.ordinal - right.row.ordinal)
    .map(({ row, score }) => ({ path: row.path, ordinal: row.ordinal, heading: row.heading, body: row.body, score }));
}

async function rankByWords(db: Queryable, userId: string, keywordQuery: string): Promise<RankedRow[]> {
  const result = await db.execute<RankedRow>(sql`
    SELECT path, ordinal, heading, body FROM vault.passages
    WHERE user_id = ${userId} AND search_vector @@ to_tsquery('simple', ${keywordQuery})
    ORDER BY ts_rank_cd(search_vector, to_tsquery('simple', ${keywordQuery})) DESC, path, ordinal
    LIMIT ${CANDIDATES}`);
  return result.rows;
}

async function rankBySimilarity(db: Queryable, userId: string, foldedQuery: string): Promise<RankedRow[]> {
  const result = await db.execute<RankedRow>(sql`
    SELECT path, ordinal, heading, body FROM vault.passages
    WHERE user_id = ${userId} AND public.word_similarity(${foldedQuery}, search_text) >= ${TRIGRAM_THRESHOLD}
    ORDER BY public.word_similarity(${foldedQuery}, search_text) DESC, path, ordinal
    LIMIT ${CANDIDATES}`);
  return result.rows;
}

async function rankByMeaning(db: Queryable, userId: string, vector: readonly number[]): Promise<RankedRow[]> {
  const result = await db.execute<RankedRow>(sql`
    SELECT path, ordinal, heading, body FROM vault.passages
    WHERE user_id = ${userId} AND embedding IS NOT NULL
    ORDER BY embedding OPERATOR(public.<=>) ${toVectorLiteral(vector)}::public.vector, path, ordinal
    LIMIT ${CANDIDATES}`);
  return result.rows;
}

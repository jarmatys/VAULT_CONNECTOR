// Search over an account's passages: by words (the folded query's prefixes against the passages' tsvector, with a
// trigram fallback for typos when words find little) and by meaning (the query's vector against the passages'
// vectors, scanned exactly within the account), merged by reciprocal rank fusion so a passage that both find ranks
// first. Without an embedder, or when the model fails, the search is by words only. A mode keeps one of the two, and
// the folders a caller may read are applied in every query, so the limit counts only passages it may return.
import type { Queryable } from "@softure-ai/db";
import type { Embedder } from "@softure-ai/llm";
import { sql, type SQL } from "drizzle-orm";
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

/** `hybrid` fuses words and meaning; `keyword` ranks by words only; `meaning` by the model only. */
export type SearchMode = "hybrid" | "keyword" | "meaning";

export interface SearchPassagesInput {
  readonly userId: string;
  readonly query: string;
  /** Null: by words only. */
  readonly embedder: Embedder | null;
  readonly limit?: number;
  /** Default hybrid. */
  readonly mode?: SearchMode;
  /**
   * The folders whose notes may be returned (a passage counts when its note lies below one of them). Omitted: every
   * passage of the account. Empty: nothing.
   */
  readonly folders?: readonly string[];
}

export interface RankedPassages {
  readonly hits: PassageHit[];
  /** Whether the ranking by meaning took part (false without a model, when the model failed, or in keyword mode). */
  readonly usedMeaning: boolean;
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
  return (await rankPassages(db, input)).hits;
}

/** The ranked passages and whether the model took part; a meaning search without a model answers by words. */
export async function rankPassages(db: Queryable, input: SearchPassagesInput): Promise<RankedPassages> {
  const mode = input.mode ?? "hybrid";
  const scope = buildFolderScope(input.folders);
  if (scope === null) return { hits: [], usedMeaning: false };
  const byMeaning = mode === "keyword" ? null : await rankByMeaning(db, input, scope);
  const rankings: RankedRow[][] = byMeaning === null ? [] : [byMeaning];
  if (mode !== "meaning" || byMeaning === null) rankings.push(...(await rankByWordsWithFallback(db, input, scope)));
  return { hits: fuseRankings(rankings).slice(0, input.limit ?? DEFAULT_LIMIT), usedMeaning: byMeaning !== null };
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

/** The condition on `path` for the folders (a folder boundary, as `isUnderFolder`): true when omitted, null when empty. */
function buildFolderScope(folders: readonly string[] | undefined): SQL | null {
  if (folders === undefined) return sql`TRUE`;
  if (folders.length === 0) return null;
  return sql`(${sql.join(
    folders.map((folder) => sql`starts_with(path, ${`${folder}/`})`),
    sql` OR `,
  )})`;
}

async function rankByWordsWithFallback(db: Queryable, input: SearchPassagesInput, scope: SQL): Promise<RankedRow[][]> {
  const keywordQuery = buildKeywordQuery(input.query);
  if (keywordQuery === null) return [];
  const byWords = await rankByWords(db, input.userId, keywordQuery, scope);
  if (byWords.length >= FEW_WORD_HITS) return [byWords];
  return [byWords, await rankBySimilarity(db, input.userId, foldForSearch(input.query), scope)];
}

async function rankByWords(db: Queryable, userId: string, keywordQuery: string, scope: SQL): Promise<RankedRow[]> {
  const result = await db.execute<RankedRow>(sql`
    SELECT path, ordinal, heading, body FROM vault.passages
    WHERE user_id = ${userId} AND ${scope} AND search_vector @@ to_tsquery('simple', ${keywordQuery})
    ORDER BY ts_rank_cd(search_vector, to_tsquery('simple', ${keywordQuery})) DESC, path, ordinal
    LIMIT ${CANDIDATES}`);
  return result.rows;
}

async function rankBySimilarity(db: Queryable, userId: string, foldedQuery: string, scope: SQL): Promise<RankedRow[]> {
  const result = await db.execute<RankedRow>(sql`
    SELECT path, ordinal, heading, body FROM vault.passages
    WHERE user_id = ${userId} AND ${scope} AND public.word_similarity(${foldedQuery}, search_text) >= ${TRIGRAM_THRESHOLD}
    ORDER BY public.word_similarity(${foldedQuery}, search_text) DESC, path, ordinal
    LIMIT ${CANDIDATES}`);
  return result.rows;
}

/** The ranking by meaning; null without a model, for an empty query or when the embedding failed. */
async function rankByMeaning(db: Queryable, input: SearchPassagesInput, scope: SQL): Promise<RankedRow[] | null> {
  const query = input.query.trim();
  if (input.embedder === null || query === "") return null;
  const embedded = await input.embedder.embedTexts({ values: [query], attributes: { userId: input.userId } });
  const vector = embedded.ok ? embedded.value.embeddings[0] : undefined;
  if (vector === undefined) return null;
  const result = await db.execute<RankedRow>(sql`
    SELECT path, ordinal, heading, body FROM vault.passages
    WHERE user_id = ${input.userId} AND ${scope} AND embedding IS NOT NULL
    ORDER BY embedding OPERATOR(public.<=>) ${toVectorLiteral(vector)}::public.vector, path, ordinal
    LIMIT ${CANDIDATES}`);
  return result.rows;
}

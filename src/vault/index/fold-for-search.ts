// The keyword side of search: the folded query (`foldWords` from `@softure-ai/core`: lower case, no accents, words
// separated by single spaces, the same fold that fills the passages' stored search text) turned into a tsquery.
import { foldWords } from "@softure-ai/core";

const PREFIX_LETTERS = 5;
const MIN_WORD_LETTERS = 2;
const MAX_QUERY_WORDS = 16;

/**
 * A `to_tsquery('simple', …)` expression for a query: each folded word as a prefix of at most its first five letters,
 * any of them matching. The prefix stands in for stemming across languages ("spotkanie" finds "spotkania", "meetings"
 * finds "meeting"); the ranking puts passages with more of the words first. Null when the query has no word.
 */
export function buildKeywordQuery(query: string): string | null {
  const words = [...new Set(foldWords(query).split(" "))].filter((word) => word.length >= MIN_WORD_LETTERS).slice(0, MAX_QUERY_WORDS);
  if (words.length === 0) return null;
  return [...new Set(words.map((word) => `${word.slice(0, PREFIX_LETTERS)}:*`))].join(" | ");
}

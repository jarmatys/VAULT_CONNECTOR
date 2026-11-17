// The text keyword search compares: lower case, accents dropped, punctuation turned into spaces, so "Zurich", "ZÜRICH"
// and "zürich" are one word and a Polish or German query matches whatever way the note was typed. Done in code rather
// than with `unaccent`, whose dictionary is not immutable and so cannot feed a generated column or an index.

// Letters that NFKD does not split into a base letter and a mark: l, o and d with stroke, sharp s, the ae and oe
// ligatures (lower case, since the text is lowered first).
const UNSPLIT_LETTERS: Readonly<Record<string, string>> = {
  "\u0142": "l",
  "\u00f8": "o",
  "\u0111": "d",
  "\u00df": "ss",
  "\u00e6": "ae",
  "\u0153": "oe",
};

const UNSPLIT_PATTERN = new RegExp(`[${Object.keys(UNSPLIT_LETTERS).join("")}]`, "gu");

/** Folds text for keyword search: lower case, no accents, words separated by single spaces. */
export function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(UNSPLIT_PATTERN, (letter) => UNSPLIT_LETTERS[letter] ?? letter)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const PREFIX_LETTERS = 5;
const MIN_WORD_LETTERS = 2;
const MAX_QUERY_WORDS = 16;

/**
 * A `to_tsquery('simple', …)` expression for a query: each folded word as a prefix of at most its first five letters,
 * any of them matching. The prefix stands in for stemming across languages ("spotkanie" finds "spotkania", "meetings"
 * finds "meeting"); the ranking puts passages with more of the words first. Null when the query has no word.
 */
export function buildKeywordQuery(query: string): string | null {
  const words = [...new Set(foldForSearch(query).split(" "))].filter((word) => word.length >= MIN_WORD_LETTERS).slice(0, MAX_QUERY_WORDS);
  if (words.length === 0) return null;
  return [...new Set(words.map((word) => `${word.slice(0, PREFIX_LETTERS)}:*`))].join(" | ");
}

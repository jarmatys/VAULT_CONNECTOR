import { describe, expect, it } from "vitest";
import { buildKeywordQuery } from "./fold-for-search.ts";

describe("buildKeywordQuery", () => {
  it("makes each word a prefix of at most five letters, any of them matching", () => {
    expect(buildKeywordQuery("Treffen mit dem Kunden")).toBe("treff:* | mit:* | dem:* | kunde:*");
  });

  it("folds accents and drops repeated words, one-letter words and repeated prefixes", () => {
    expect(buildKeywordQuery("Spotkanie z klientem, spotkania")).toBe("spotk:* | klien:*");
    expect(buildKeywordQuery("Zürich zurich")).toBe("zuric:*");
  });

  it("is null for a query with no word and keeps at most sixteen words", () => {
    expect(buildKeywordQuery("?! -")).toBeNull();
    const words = Array.from({ length: 20 }, (_, index) => `${String.fromCharCode(97 + index)}word`).join(" ");
    expect(buildKeywordQuery(words)?.split(" | ")).toHaveLength(16);
  });
});

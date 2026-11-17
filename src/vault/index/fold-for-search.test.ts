import { describe, expect, it } from "vitest";
import { buildKeywordQuery, foldForSearch } from "./fold-for-search.ts";

describe("foldForSearch", () => {
  it("lowers case, drops accents and turns punctuation into single spaces", () => {
    expect(foldForSearch("  Zürich -- ÉTÉ, naïve!  ")).toBe("zurich ete naive");
  });

  it("folds the letters NFKD leaves whole", () => {
    // l with stroke, o with stroke, d with stroke, sharp s, ae and oe ligatures, upper and lower case.
    expect(foldForSearch("\u0141\u00F3d\u017A \u0142\u0105ka Str\u00F6m \u00D8re \u0110ak Stra\u00DFe \u00C6ther \u0152uvre")).toBe(
      "lodz laka strom ore dak strasse aether oeuvre",
    );
  });

  it("keeps digits and gives an empty string for text without words", () => {
    expect(foldForSearch("Q3 2026")).toBe("q3 2026");
    expect(foldForSearch(" -- !! ")).toBe("");
  });
});

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

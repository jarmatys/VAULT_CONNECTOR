import { describe, expect, it } from "vitest";
import { foldText, resolveNotePath } from "./shared-notes.ts";
import { makeNote } from "./testing/notes.ts";

describe("foldText", () => {
  it("ignores case and accents, the stroked l included", () => {
    expect(foldText("\u017Bycie/\u0141\u00F3d\u017A")).toBe("zycie/lodz");
  });
});

describe("resolveNotePath", () => {
  const notes = [makeNote("Work/Plan.md"), makeNote("\u017Bycie/Zdrowie.md"), makeNote("A/x.md"), makeNote("a/X.md")];

  it("finds the exact path, with a leading slash and surrounding spaces dropped", () => {
    expect(resolveNotePath(" /Work/Plan.md ", notes)?.path).toBe("Work/Plan.md");
  });

  it("finds the one note whose folded path matches when the case or accents differ", () => {
    expect(resolveNotePath("zycie/zdrowie.md", notes)?.path).toBe("\u017Bycie/Zdrowie.md");
  });

  it("matches a decomposed (NFD) path to the stored NFC one", () => {
    expect(resolveNotePath("\u017Bycie/Zdrowie.md".normalize("NFD"), notes)?.path).toBe("\u017Bycie/Zdrowie.md");
  });

  it("refuses an ambiguous folded match, an unknown path and an empty one", () => {
    expect(resolveNotePath("A/X.MD", notes)).toBeNull();
    expect(resolveNotePath("Work/Missing.md", notes)).toBeNull();
    expect(resolveNotePath("  ", notes)).toBeNull();
  });
});

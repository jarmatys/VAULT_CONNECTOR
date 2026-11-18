// The served pages come from the bundle, so the bundle must be the docs folder exactly; and the pages it yields are
// the published ones, found by slug.
import { describe, expect, it } from "vitest";
import { getDocPage, getDocPages, parseDocSources } from "./doc-pages.ts";
import { DOC_SOURCES } from "./doc-sources.generated.ts";
import { renderDocSourcesModule } from "./doc-sources-module.ts";
import { PUBLISHED_DOC_SLUGS } from "./docs-content.ts";
import { readDocSources } from "./load-docs.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("the bundled docs", () => {
  it("is the docs folder exactly (run `npm run docs:bundle` after changing a docs file)", () => {
    expect(DOC_SOURCES).toEqual(readDocSources());
    expect(readFileSync(join(import.meta.dirname, "doc-sources.generated.ts"), "utf8")).toBe(renderDocSourcesModule(readDocSources()));
  });

  it("serves the published pages in the reading order and finds one by slug", () => {
    expect(getDocPages().map((page) => page.slug)).toEqual([...PUBLISHED_DOC_SLUGS]);
    expect(getDocPage("tools")?.title).toBe("Tools");
    expect(getDocPage("no-such-page")).toBeNull();
  });

  it("names the file that does not parse", () => {
    expect(() => parseDocSources({ broken: "no front matter" })).toThrow(/broken\.md does not parse/);
  });
});

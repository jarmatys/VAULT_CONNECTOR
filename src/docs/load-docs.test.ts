// The real docs folder: every page parses, the folder holds exactly the published pages (so sitemap.xml lists them
// all), the directory's required pages exist, links between pages point at pages that exist, and every file the
// directory checklist names as evidence is in the repository.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS_SITEMAP_ENTRIES } from "./agent-discovery.ts";
import { DOCS_PATH, PUBLISHED_DOC_SLUGS, REQUIRED_DOC_SLUGS } from "./docs-content.ts";
import { DOCS_DIRECTORY, findDocPage, loadDocPages } from "./load-docs.ts";

const REPOSITORY = join(DOCS_DIRECTORY, "../..");

describe("the docs folder", () => {
  it("holds exactly the published pages, in the reading order", () => {
    expect(loadDocPages().map((page) => page.slug)).toEqual([...PUBLISHED_DOC_SLUGS]);
  });

  it("has every page the directory asks for", () => {
    for (const slug of REQUIRED_DOC_SLUGS) expect(findDocPage(slug)?.slug).toBe(slug);
  });

  it("lists every page in sitemap.xml", () => {
    expect(DOCS_SITEMAP_ENTRIES.map((entry) => entry.path)).toEqual([DOCS_PATH, ...PUBLISHED_DOC_SLUGS.map((slug) => `${DOCS_PATH}/${slug}`)]);
  });

  it("starts no page with its own top heading: the page header shows the title", () => {
    for (const page of loadDocPages()) expect(page.body.startsWith("# ")).toBe(false);
  });

  it("links only to docs pages that exist", () => {
    for (const page of loadDocPages()) {
      for (const match of page.body.matchAll(/\]\(\/docs\/([a-z0-9-]+)(?:#[a-z0-9-]+)?\)/g)) {
        expect(PUBLISHED_DOC_SLUGS, `${page.slug} links to /docs/${match[1]}`).toContain(match[1]);
      }
    }
  });

  it("names only evidence files that exist in the repository", () => {
    const checklist = findDocPage("directory-checklist");
    if (checklist === null) throw new Error("no directory checklist");
    const named = [...checklist.body.matchAll(/`((?:src|e2e|content)\/[^`]+)`/g)].map((match) => match[1] ?? "");
    expect(named.length).toBeGreaterThan(10);
    for (const path of named) expect(existsSync(join(REPOSITORY, path)), path).toBe(true);
  });
});

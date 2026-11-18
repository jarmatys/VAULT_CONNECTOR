// The docs pages as the app serves them: parsed from the Markdown bundled into `doc-sources.generated.ts`, so they
// render on Node and on a Worker alike (a Worker has no file system to read `content/docs` from).
import { DOC_SOURCES } from "./doc-sources.generated.ts";
import { parseDocPage, sortDocPages, type DocPage } from "./docs-content.ts";

/** Parses Markdown sources by slug into pages in the docs' order. Throws on a source that does not parse. */
export function parseDocSources(sources: Readonly<Record<string, string>>): DocPage[] {
  const pages = Object.entries(sources).map(([slug, markdown]) => {
    const parsed = parseDocPage(slug, markdown);
    if (!parsed.ok) throw new Error(`parseDocSources: ${slug}.md does not parse (${parsed.error})`);
    return parsed.value;
  });
  return sortDocPages(pages);
}

const PAGES = parseDocSources(DOC_SOURCES);

/** Every published page, in the docs' order. */
export function getDocPages(): readonly DocPage[] {
  return PAGES;
}

/** One published page by slug, or null. */
export function getDocPage(slug: string): DocPage | null {
  return PAGES.find((page) => page.slug === slug) ?? null;
}

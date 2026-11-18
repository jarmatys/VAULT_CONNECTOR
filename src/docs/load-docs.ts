// Reads `content/docs/*.md` at build time (the docs pages are prerendered; the Worker never runs this). A file that
// does not parse stops the build with its name, so a broken page cannot ship.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocPage, sortDocPages, type DocPage } from "./docs-content.ts";

/** The folder of the docs' Markdown files. */
export const DOCS_DIRECTORY = join(process.cwd(), "content", "docs");

/** Every page, in the docs' order. Throws on a file that does not parse. */
export function loadDocPages(directory: string = DOCS_DIRECTORY): DocPage[] {
  const pages = readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const slug = name.slice(0, -".md".length);
      const parsed = parseDocPage(slug, readFileSync(join(directory, name), "utf8"));
      if (!parsed.ok) throw new Error(`loadDocPages: ${name} does not parse (${parsed.error})`);
      return parsed.value;
    });
  return sortDocPages(pages);
}

/** One page by slug, or null. */
export function findDocPage(slug: string, directory: string = DOCS_DIRECTORY): DocPage | null {
  return loadDocPages(directory).find((page) => page.slug === slug) ?? null;
}

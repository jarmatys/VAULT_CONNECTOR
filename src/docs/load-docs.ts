// Reads `content/docs/*.md` from the repository: the source of the bundled pages (`npm run docs:bundle`), the folder
// guard in the tests and the e2e. The app never runs this: a Worker has no file system, so the pages come from
// `doc-sources.generated.ts` (`doc-pages.ts`).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocSources } from "./doc-pages.ts";
import type { DocPage } from "./docs-content.ts";

/** The folder of the docs' Markdown files. */
export const DOCS_DIRECTORY = join(process.cwd(), "content", "docs");

/** Every Markdown file of the folder by slug, in file-name order. */
export function readDocSources(directory: string = DOCS_DIRECTORY): Record<string, string> {
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .sort();
  return Object.fromEntries(names.map((name) => [name.slice(0, -".md".length), readFileSync(join(directory, name), "utf8")]));
}

/** Every page of the folder, in the docs' order. Throws on a file that does not parse. */
export function loadDocPages(directory: string = DOCS_DIRECTORY): DocPage[] {
  return parseDocSources(readDocSources(directory));
}

/** One page of the folder by slug, or null. */
export function findDocPage(slug: string, directory: string = DOCS_DIRECTORY): DocPage | null {
  return loadDocPages(directory).find((page) => page.slug === slug) ?? null;
}

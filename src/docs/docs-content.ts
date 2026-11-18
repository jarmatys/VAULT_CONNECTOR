// The public documentation (VC-17, FR-21): one Markdown file per page in `content/docs/`, with a small front matter
// (`title`, `description`, `order`). The pages are prerendered, so the files are read at build time only; the parse and
// the render are pure, so the tests read the same files the pages do.
import MarkdownIt from "markdown-it";

/** Where the docs pages live. */
export const DOCS_PATH = "/docs";

/** The pages the directory and the PRD ask for (FR-21), by slug; every one must exist in `content/docs/`. */
export const REQUIRED_DOC_SLUGS = ["getting-started", "tools", "privacy-and-security", "self-hosting", "faq"] as const;

/** Every page in content/docs, in reading order; a test holds the folder to it, so sitemap.xml lists them all. */
export const PUBLISHED_DOC_SLUGS = [...REQUIRED_DOC_SLUGS, "chatgpt", "directory-checklist"] as const;

export interface DocPage {
  /** The file name without `.md`: the page's path under `/docs`. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /** Position in the docs' list, lowest first. */
  readonly order: number;
  /** The Markdown after the front matter. */
  readonly body: string;
}

export type DocParseError = "docs.front_matter_missing" | "docs.title_missing" | "docs.description_missing" | "docs.order_invalid" | "docs.slug_invalid";

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One page from its file: the front matter's fields and the body, or what is wrong with it. */
export function parseDocPage(slug: string, source: string): { readonly ok: true; readonly value: DocPage } | { readonly ok: false; readonly error: DocParseError } {
  if (!SLUG.test(slug)) return { ok: false, error: "docs.slug_invalid" };
  const match = FRONT_MATTER.exec(source.replace(/\r\n/g, "\n"));
  if (match === null) return { ok: false, error: "docs.front_matter_missing" };
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const title = fields.get("title") ?? "";
  const description = fields.get("description") ?? "";
  const order = Number(fields.get("order") ?? "");
  if (title === "") return { ok: false, error: "docs.title_missing" };
  if (description === "") return { ok: false, error: "docs.description_missing" };
  if (!Number.isInteger(order) || order < 1) return { ok: false, error: "docs.order_invalid" };
  return { ok: true, value: { slug, title, description, order, body: source.replace(/\r\n/g, "\n").slice(match[0].length).trim() } };
}

/** The pages in the docs' order (then by slug, so the list never depends on the file system). */
export function sortDocPages(pages: readonly DocPage[]): DocPage[] {
  return [...pages].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

/** A heading's anchor: lower case, words joined by `-` (`Your notes are data` → `your-notes-are-data`). */
export function toHeadingId(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Raw HTML in a file is escaped, not rendered: the docs are Markdown only.
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
const renderHeadingOpen = markdown.renderer.rules["heading_open"];
markdown.renderer.rules["heading_open"] = (tokens, index, options, env, self) => {
  const inline = tokens[index + 1];
  const token = tokens[index];
  if (token !== undefined && inline?.type === "inline" && (token.tag === "h2" || token.tag === "h3")) token.attrSet("id", toHeadingId(inline.content));
  return renderHeadingOpen === undefined ? self.renderToken(tokens, index, options) : renderHeadingOpen(tokens, index, options, env, self);
};

/** The page's body as HTML: `h2` and `h3` carry anchors, raw HTML is escaped. */
export function renderDocBody(body: string): string {
  return markdown.render(body);
}

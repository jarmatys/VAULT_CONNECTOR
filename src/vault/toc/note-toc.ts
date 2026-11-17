// A note's entry in the table of contents: its title, tags, aliases and description, read from the note's own text.
// Title: the frontmatter `title`, else the first `# ` heading, else the file name without `.md`. Description: the
// frontmatter `description`, else `summary`. Tags and aliases: the frontmatter lists (`tags: [a, b]`, a block list,
// or a single or comma-separated value), tags without a leading `#`. Only these keys of the frontmatter are read, by a
// small reader of the YAML subset notes use; anything else in it is ignored, never evaluated. Note text is data.

export interface NoteToc {
  readonly title: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly description: string | null;
}

/** The limits of the table's columns: longer values are cut, never refused. */
export const MAX_TITLE_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;

type FrontmatterValue = string | readonly string[];

/** The note's entry, from its path and its text. */
export function extractNoteToc(path: string, text: string): NoteToc {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const { frontmatter, body } = splitFrontmatter(normalized);
  const title = readScalar(frontmatter.get("title")) ?? readFirstHeading(body) ?? readFileTitle(path);
  const description = readScalar(frontmatter.get("description")) ?? readScalar(frontmatter.get("summary"));
  return {
    title: cut(title, MAX_TITLE_LENGTH),
    tags: readList(frontmatter.get("tags") ?? frontmatter.get("tag"), /[,\s]+/).map((tag) => tag.replace(/^#/, "")).filter((tag) => tag !== ""),
    aliases: readList(frontmatter.get("aliases") ?? frontmatter.get("alias"), /,/),
    description: description === undefined ? null : cut(description, MAX_DESCRIPTION_LENGTH),
  };
}

/** The file name without its folders and `.md` (any case). */
export function readFileTitle(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const stem = name.replace(/\.md$/i, "");
  return stem === "" ? name : stem;
}

function splitFrontmatter(text: string): { frontmatter: Map<string, FrontmatterValue>; body: string } {
  if (!text.startsWith("---\n")) return { frontmatter: new Map(), body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: new Map(), body: text };
  const afterFence = text.indexOf("\n", end + 4);
  const body = afterFence === -1 ? "" : text.slice(afterFence + 1);
  return { frontmatter: parseFrontmatter(text.slice(4, end)), body };
}

function parseFrontmatter(block: string): Map<string, FrontmatterValue> {
  const values = new Map<string, FrontmatterValue>();
  const lines = block.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[index] ?? "");
    if (match === null) continue;
    const key = (match[1] ?? "").toLowerCase();
    const rest = (match[2] ?? "").trim();
    if (rest !== "") {
      values.set(key, rest.startsWith("[") && rest.endsWith("]") ? splitInline(rest.slice(1, -1)) : unquote(rest));
      continue;
    }
    // A block list: the indented `- item` lines that follow.
    const items: string[] = [];
    while (index + 1 < lines.length && /^\s+-\s*|^-\s+/.test(lines[index + 1] ?? "")) {
      index += 1;
      items.push(unquote((lines[index] ?? "").replace(/^\s*-\s*/, "")));
    }
    if (items.length > 0) values.set(key, items);
  }
  return values;
}

function splitInline(inner: string): string[] {
  return inner.split(",").map((item) => unquote(item.trim()));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  // A comment after a plain value.
  return trimmed.replace(/\s+#.*$/, "");
}

function readScalar(value: FrontmatterValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = (typeof value === "string" ? value : value.join(", ")).trim();
  return text === "" ? undefined : text;
}

/** A list value; a single value is split by `separator` (tags by commas and spaces, aliases by commas only). */
function readList(value: FrontmatterValue | undefined, separator: RegExp): string[] {
  if (value === undefined) return [];
  const items = typeof value === "string" ? value.split(separator) : value;
  const unique = [...new Set(items.map((item) => item.trim()).filter((item) => item !== ""))];
  return unique.slice(0, MAX_LIST_ITEMS).map((item) => cut(item, MAX_ITEM_LENGTH));
}

function readFirstHeading(body: string): string | undefined {
  let isInFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) isInFence = !isInFence;
    if (isInFence) continue;
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1] !== undefined && match[1] !== "") return match[1];
  }
  return undefined;
}

function cut(value: string, max: number): string {
  return [...value].length <= max ? value : [...value].slice(0, max).join("");
}

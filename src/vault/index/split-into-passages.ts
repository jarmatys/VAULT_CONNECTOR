// A note cut into passages for search: one heading's text at a time, paragraphs joined up to about a thousand
// characters, a paragraph longer than the hard limit cut at a space. Each passage keeps the heading path it sits
// under, so a hit can say where in the note it is, and so the embedding of a short passage still knows its topic.
// Frontmatter is left out: it is metadata, not the note's text.

export interface Passage {
  /** 0, 1, 2… in note order. */
  readonly ordinal: number;
  /** The headings above the passage, outermost first, joined by " > "; empty above the first heading. */
  readonly heading: string;
  readonly body: string;
}

export interface PassageLimits {
  /** Paragraphs are joined while the passage stays within this many characters. */
  readonly targetChars: number;
  /** A single paragraph longer than this is cut. */
  readonly maxChars: number;
  /** Passages kept per note; the rest of a very long note is not searchable (the note is still readable whole). */
  readonly maxPassages: number;
}

export const DEFAULT_PASSAGE_LIMITS: PassageLimits = { targetChars: 1_000, maxChars: 1_600, maxPassages: 200 };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

interface Section {
  readonly heading: string;
  readonly lines: string[];
}

/** Splits a note's Markdown into passages. A note with no text gives none. */
export function splitIntoPassages(markdown: string, limits: PassageLimits = DEFAULT_PASSAGE_LIMITS): readonly Passage[] {
  const passages: Passage[] = [];
  for (const section of readSections(stripFrontmatter(markdown))) {
    for (const body of joinParagraphs(readParagraphs(section.lines), limits)) {
      if (passages.length >= limits.maxPassages) return passages;
      passages.push({ ordinal: passages.length, heading: section.heading, body });
    }
  }
  return passages;
}

/**
 * The text a passage is embedded and keyword-indexed by: the note's title, the heading path and the body. The title is
 * left out when the heading path starts with it (a note titled by its first heading).
 */
export function describePassage(title: string, passage: Pick<Passage, "heading" | "body">): string {
  const repeatsTitle = passage.heading === title || passage.heading.startsWith(`${title} > `);
  return [repeatsTitle ? "" : title, passage.heading, passage.body].filter((part) => part !== "").join("\n");
}

/** A note's title as the vault shows it: the file name without its folder and `.md`. */
export function getNoteTitle(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function stripFrontmatter(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  const after = text.indexOf("\n", end + 4);
  return after === -1 ? "" : text.slice(after + 1);
}

function readSections(text: string): Section[] {
  const sections: Section[] = [{ heading: "", lines: [] }];
  const path: { level: number; title: string }[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const match = inFence ? null : HEADING.exec(line);
    if (match === null) {
      sections[sections.length - 1]?.lines.push(line);
      continue;
    }
    const level = match[1]?.length ?? 1;
    while (path.length > 0 && (path[path.length - 1]?.level ?? 0) >= level) path.pop();
    path.push({ level, title: match[2] ?? "" });
    sections.push({ heading: path.map((entry) => entry.title).join(" > "), lines: [] });
  }
  return sections;
}

function readParagraphs(lines: readonly string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) paragraphs.push(current.join("\n"));
      current = [];
    } else {
      current.push(line.trimEnd());
    }
  }
  if (current.length > 0) paragraphs.push(current.join("\n"));
  return paragraphs;
}

function joinParagraphs(paragraphs: readonly string[], limits: PassageLimits): string[] {
  const bodies: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.flatMap((text) => cutLong(text, limits.maxChars))) {
    if (current !== "" && current.length + 2 + paragraph.length > limits.targetChars) {
      bodies.push(current);
      current = "";
    }
    current = current === "" ? paragraph : `${current}\n\n${paragraph}`;
  }
  if (current !== "") bodies.push(current);
  return bodies;
}

function cutLong(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const space = rest.lastIndexOf(" ", maxChars);
    const cut = space > maxChars / 2 ? space : maxChars;
    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest !== "") pieces.push(rest);
  return pieces;
}

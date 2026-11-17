// The table of contents entry of a note: title, tags, aliases and description from its frontmatter and text.
import { describe, expect, it } from "vitest";
import { extractNoteToc, MAX_TITLE_LENGTH, readFileTitle } from "./note-toc.ts";

describe("a note's table of contents entry", () => {
  it("takes the frontmatter's title, inline tags, block aliases and description", () => {
    const text = ["---", 'title: "Quarterly plan"', "tags: [work, '#planning', work]", "aliases:", "  - Q plan", "  - Plan Q4", "description: What we ship this quarter", "---", "# Heading", ""].join("\n");
    expect(extractNoteToc("Work/plan.md", text)).toEqual({
      title: "Quarterly plan",
      tags: ["work", "planning"],
      aliases: ["Q plan", "Plan Q4"],
      description: "What we ship this quarter",
    });
  });

  it("falls back to the first heading, then to the file name, and to summary for the description", () => {
    expect(extractNoteToc("Work/plan.md", "---\nsummary: Short\n---\nIntro\n\n# Real title #\n# Second").title).toBe("Real title");
    expect(extractNoteToc("Work/plan.md", "---\nsummary: Short\n---\n").description).toBe("Short");
    expect(extractNoteToc("Work/Meeting notes.MD", "No heading here\n## Only a subheading").title).toBe("Meeting notes");
    expect(readFileTitle("Top.md")).toBe("Top");
  });

  it("ignores a heading inside a code fence and a frontmatter without its closing fence", () => {
    expect(extractNoteToc("a/b.md", "```\n# not a title\n```\n# Title").title).toBe("Title");
    const unclosed = extractNoteToc("a/b.md", "---\ntitle: Never\n# Heading");
    expect(unclosed.title).toBe("Heading");
    expect(unclosed.tags).toEqual([]);
  });

  it("reads a byte order mark, CRLF line ends and a single-value list", () => {
    const toc = extractNoteToc("a/b.md", "﻿---\r\ntags: alpha, beta gamma\r\naliases: Only alias\r\n---\r\n# Hello\r\n");
    expect(toc).toEqual({ title: "Hello", tags: ["alpha", "beta", "gamma"], aliases: ["Only alias"], description: null });
  });

  it("has empty lists and no description when the note has no frontmatter", () => {
    expect(extractNoteToc("x/y.md", "")).toEqual({ title: "y", tags: [], aliases: [], description: null });
  });

  it("cuts an overlong title instead of refusing the note", () => {
    expect([...extractNoteToc("x/y.md", `# ${"é".repeat(MAX_TITLE_LENGTH + 20)}`).title]).toHaveLength(MAX_TITLE_LENGTH);
  });
});

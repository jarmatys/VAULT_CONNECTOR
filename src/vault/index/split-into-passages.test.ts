import { describe, expect, it } from "vitest";
import { describePassage, getNoteTitle, splitIntoPassages } from "./split-into-passages.ts";

describe("splitIntoPassages", () => {
  it("keeps the heading path above each passage and leaves out the frontmatter", () => {
    const note = ["---", "tags: [work]", "---", "Intro line.", "", "# Projects", "", "## Garden", "Plant tomatoes.", "", "# Travel", "Book the train."].join("\n");
    expect(splitIntoPassages(note)).toEqual([
      { ordinal: 0, heading: "", body: "Intro line." },
      { ordinal: 1, heading: "Projects > Garden", body: "Plant tomatoes." },
      { ordinal: 2, heading: "Travel", body: "Book the train." },
    ]);
  });

  it("joins short paragraphs up to the target and starts a new passage past it", () => {
    const paragraph = "a".repeat(400);
    const passages = splitIntoPassages([paragraph, paragraph, paragraph].join("\n\n"));
    expect(passages.map((passage) => passage.body.length)).toEqual([802, 400]);
  });

  it("cuts a paragraph longer than the hard limit at a space", () => {
    const words = Array.from({ length: 500 }, () => "word").join(" ");
    const passages = splitIntoPassages(words);
    expect(passages.every((passage) => passage.body.length <= 1_600)).toBe(true);
    expect(passages.map((passage) => passage.body).join(" ")).toBe(words);
  });

  it("does not read a heading inside a code fence", () => {
    const passages = splitIntoPassages(["# Script", "```bash", "# not a heading", "echo hi", "```"].join("\n"));
    expect(passages).toEqual([{ ordinal: 0, heading: "Script", body: "```bash\n# not a heading\necho hi\n```" }]);
  });

  it("gives nothing for an empty note or one with only frontmatter and headings", () => {
    expect(splitIntoPassages("")).toEqual([]);
    expect(splitIntoPassages("---\na: 1\n---\n# Title\n\n## Empty\n")).toEqual([]);
  });

  it("stops at the passage cap", () => {
    const note = Array.from({ length: 10 }, (_, index) => `# H${String(index)}\ntext`).join("\n");
    expect(splitIntoPassages(note, { targetChars: 1_000, maxChars: 1_600, maxPassages: 3 }).map((passage) => passage.heading)).toEqual(["H0", "H1", "H2"]);
  });
});

describe("describePassage and getNoteTitle", () => {
  it("puts the title and heading path before the body", () => {
    expect(describePassage(getNoteTitle("Work/Clients/Acme.md"), { heading: "Meetings", body: "Weekly call." })).toBe("Acme\nMeetings\nWeekly call.");
    expect(describePassage("Note", { heading: "", body: "Body." })).toBe("Note\nBody.");
    expect(describePassage("Acme", { heading: "Acme > Calls", body: "Weekly." })).toBe("Acme > Calls\nWeekly.");
  });
});

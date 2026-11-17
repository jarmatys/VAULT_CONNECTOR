// The note and ignore rules and the folder tree an account picks from, on a fictional vault listing.
import { describe, expect, it } from "vitest";
import { buildFolderTree, isNotePath, type FolderNode } from "./folder-tree.ts";

function files(...paths: string[]) {
  return paths.map((path) => ({ path }));
}

function outline(nodes: readonly FolderNode[]): unknown[] {
  return nodes.map((node) => [node.path, node.noteCount, ...(node.children.length === 0 ? [] : [outline(node.children)])]);
}

describe("a note", () => {
  it("is a Markdown file of any case outside every dot folder, and not an Excalidraw drawing", () => {
    expect(isNotePath("Projects/Plan.md")).toBe(true);
    expect(isNotePath("Projects/PLAN.MD")).toBe(true);
    expect(isNotePath("Inbox.md")).toBe(true);
    expect(isNotePath("Notizen/Übersicht.md")).toBe(true);
    expect(isNotePath("Projects/Board.excalidraw.md")).toBe(false);
    expect(isNotePath("Projects/diagram.png")).toBe(false);
    expect(isNotePath("Projects/notes.markdown")).toBe(false);
    expect(isNotePath(".obsidian/workspace.md")).toBe(false);
    expect(isNotePath("Projects/.trash/Old.md")).toBe(false);
    expect(isNotePath(".github/README.md")).toBe(false);
    expect(isNotePath("Projects/.md")).toBe(false);
    expect(isNotePath("Projects/.hidden.md")).toBe(false);
    expect(isNotePath("/Projects/Plan.md")).toBe(false);
    expect(isNotePath("Projects//Plan.md")).toBe(false);
  });
});

describe("the folder tree", () => {
  it("lists the folders holding notes, sorted as a person sorts, with counts that include subfolders", () => {
    const tree = buildFolderTree(
      files(
        "Inbox.md",
        "Work/Plan.md",
        "Work/Clients/Acme.md",
        "Work/Clients/Globex.md",
        "Work/Board.excalidraw.md",
        "work-archive/2025.md",
        "Area 10/a.md",
        "Area 9/b.md",
        "Attachments/photo.png",
        ".obsidian/app.json",
        ".trash/Deleted.md",
        "Work/.drafts/Secret.md",
        "README.MD",
      ),
    );

    expect(outline(tree.folders)).toEqual([
      ["Area 9", 1],
      ["Area 10", 1],
      ["Work", 3, [["Work/Clients", 2]]],
      ["work-archive", 1],
    ]);
    expect(tree.topLevelNoteCount).toBe(2);
    expect([...tree.paths].sort()).toEqual(["Area 10", "Area 9", "Work", "Work/Clients", "work-archive"]);
  });

  it("is empty for an empty vault or one with no notes in folders", () => {
    expect(buildFolderTree([])).toEqual({ folders: [], topLevelNoteCount: 0, paths: new Set() });
    const onlyTop = buildFolderTree(files("Inbox.md", "img/a.png"));
    expect([onlyTop.folders, onlyTop.topLevelNoteCount]).toEqual([[], 1]);
  });
});

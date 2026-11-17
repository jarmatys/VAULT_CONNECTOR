// What of a vault can be shared: the note and ignore rules, and the folder tree an account picks from. A note is a
// Markdown file (`.md`, any case) that is not an Excalidraw drawing; nothing inside a dot folder (`.obsidian`,
// `.trash`, `.git`, `.github`, an editor's folder) is shown or shared; a folder with no note inside is not shown. The
// sync (VC-8) copies by the same rules, so they live here only.
import type { SourceFile } from "../sources/source.ts";

export interface FolderNode {
  /** Relative, `/`-separated, no leading or trailing slash. */
  readonly path: string;
  readonly name: string;
  /** Notes in this folder and every folder below it. */
  readonly noteCount: number;
  readonly children: readonly FolderNode[];
}

export interface FolderTree {
  readonly folders: readonly FolderNode[];
  /** Notes at the top level of the vault, outside any folder: no pick shares them. */
  readonly topLevelNoteCount: number;
  /** Every folder path of the tree, for checking a pick. */
  readonly paths: ReadonlySet<string>;
}

/** Whether a vault file is a note the product may share (its folder still has to be picked). */
export function isNotePath(path: string): boolean {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  const lower = name.toLowerCase();
  if (!lower.endsWith(".md") || lower.endsWith(".excalidraw.md") || lower === ".md") return false;
  return segments.slice(0, -1).every((segment) => segment !== "" && !segment.startsWith("."));
}

interface MutableNode {
  readonly path: string;
  readonly name: string;
  noteCount: number;
  readonly children: Map<string, MutableNode>;
}

/** The folder tree of a listing: folders holding at least one note, sorted by name, with note counts. */
export function buildFolderTree(files: readonly Pick<SourceFile, "path">[]): FolderTree {
  const root = new Map<string, MutableNode>();
  let topLevelNoteCount = 0;
  for (const file of files) {
    if (!isNotePath(file.path)) continue;
    const folders = file.path.split("/").slice(0, -1);
    if (folders.length === 0) topLevelNoteCount += 1;
    let level = root;
    folders.forEach((name, index) => {
      const path = folders.slice(0, index + 1).join("/");
      const node = level.get(name) ?? { path, name, noteCount: 0, children: new Map<string, MutableNode>() };
      level.set(name, node);
      node.noteCount += 1;
      level = node.children;
    });
  }
  const paths = new Set<string>();
  return { folders: freeze(root, paths), topLevelNoteCount, paths };
}

function freeze(level: ReadonlyMap<string, MutableNode>, paths: Set<string>): FolderNode[] {
  return [...level.values()]
    .sort((left, right) => compareNames(left.name, right.name))
    .map((node) => {
      paths.add(node.path);
      return { path: node.path, name: node.name, noteCount: node.noteCount, children: freeze(node.children, paths) };
    });
}

/** Folder names as a person sorts them: case-insensitive, accents after their base letter, numbers by value. */
function compareNames(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base", numeric: true }) || left.localeCompare(right);
}

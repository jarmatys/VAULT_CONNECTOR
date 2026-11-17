// `vault_index`: the table of contents of the shared notes as text an assistant reads cheaply (FR-14). Folders come
// from the notes' paths, with a count and the newest change of every note below them, and the description of the folder
// note (`Folder/Folder.md`) when it has one. Everything taken from notes (paths, titles, tags, descriptions) is data, so
// the body sits between the untrusted-data markers; only the header and the hints are the server's.
import { formatMessage } from "@softure-ai/core";
import { en } from "../messages/en.ts";
import type { StoredNote } from "../vault/sync/sync-store.ts";
import { foldText } from "./shared-notes.ts";
import { wrapUntrusted } from "./untrusted.ts";

export interface VaultIndexArgs {
  readonly folder?: string | undefined;
  readonly filter?: string | undefined;
  readonly depth?: number | undefined;
  readonly recursive?: boolean | undefined;
  readonly sort?: "name" | "recent" | undefined;
  readonly maxResults?: number | undefined;
}

export interface ToolText {
  readonly text: string;
  readonly isError: boolean;
}

/** Lines of the body at most; longer answers are cut with a hint. */
export const MAX_INDEX_LINES = 300;
export const DEFAULT_MAX_RESULTS = 100;
/** Folders shown for a filter at most. */
const MAX_MATCHING_FOLDERS = 30;

const copy = en.mcp.answers;

interface FolderStats {
  count: number;
  updated: string;
}

export function renderVaultIndex(notes: readonly StoredNote[], args: VaultIndexArgs, syncedAt: Date | null): ToolText {
  const stats = collectFolderStats(notes);
  const folder = resolveFolder(args.folder, stats);
  if (folder === null) {
    const top = [...stats.keys()].filter((path) => path !== "" && !path.includes("/"));
    return { isError: true, text: top.length === 0 ? copy.folderUnknown : `${copy.folderUnknown}\n${wrapUntrusted(top.join("\n"))}` };
  }
  const depth = clamp(args.depth ?? (folder === "" ? 1 : 2), 1, 5);
  const limit = clamp(args.maxResults ?? DEFAULT_MAX_RESULTS, 1, 500);
  const order = args.sort === "recent" ? byRecent : byName;
  const isInScope = (path: string) => folder === "" || path.startsWith(`${folder}/`);
  const descriptions = collectFolderDescriptions(notes);
  const folderLine = (path: string, indent: string) => {
    const folderStats = stats.get(path) ?? { count: 0, updated: "" };
    const description = descriptions.get(path);
    return `${indent}${formatMessage(copy.folderLine, {
      path,
      notes: countNotes(folderStats.count),
      updated: folderStats.updated,
      description: description === undefined ? "" : ` — ${description}`,
    })}`;
  };

  const header = formatMessage(copy.indexHeader, { notes: countNotes(notes.length), syncedAt: syncedAt === null ? "—" : formatMinute(syncedAt) });
  // A folder's name is the vault's, so the scope line opens the body between the markers; the top is the server's.
  const lines: string[] = folder === "" ? [] : [formatMessage(copy.indexScopeFolder, { folder, notes: countNotes(stats.get(folder)?.count ?? 0) }), ""];
  const hints: string[] = folder === "" ? [copy.indexScopeTop] : [];
  const scopeLines = lines.length;

  const filter = args.filter?.trim() ?? "";
  if (filter !== "") {
    const words = foldText(filter).split(/\s+/).filter((word) => word !== "");
    const haystack = (note: StoredNote) => foldText([note.path, note.title, ...note.tags, ...note.aliases].join(" "));
    const hits = notes.filter((note) => isInScope(note.path) && words.every((word) => haystack(note).includes(word))).sort(order);
    const folders = [...stats.keys()].filter((path) => path !== "" && isInScope(`${path}/`) && words.every((word) => foldText(path).includes(word)));
    hints.push(formatMessage(copy.indexFilter, { notes: countNotes(hits.length), folders: countFolders(folders.length) }));
    if (folders.length > 0) lines.push(copy.indexMatchingFolders, ...folders.slice(0, MAX_MATCHING_FOLDERS).map((path) => folderLine(path, "- ")));
    if (hits.length > 0) lines.push(...(lines.length > scopeLines ? [""] : []), copy.indexMatchingNotes, ...hits.slice(0, limit).map(formatNoteLine));
    if (hits.length > limit) hints.push(formatMessage(copy.indexMore, { count: hits.length - limit }));
    if (hits.length === 0 && folders.length === 0) hints.push(copy.indexNoMatch);
  } else {
    const base = folder === "" ? 0 : folder.split("/").length;
    const subfolders = [...stats.keys()]
      .filter((path) => path !== "" && path !== folder && isInScope(`${path}/`) && path.split("/").length - base <= depth)
      .sort((left, right) => left.localeCompare(right));
    if (subfolders.length > 0) {
      lines.push(depth > 1 ? formatMessage(copy.indexSubfoldersDeep, { depth }) : copy.indexSubfolders);
      for (const path of subfolders) lines.push(folderLine(path, `${"  ".repeat(path.split("/").length - base - 1)}- `));
    }
    const direct = notes.filter((note) => (args.recursive === true ? isInScope(note.path) : parentOf(note.path) === folder)).sort(order);
    if (direct.length > 0) {
      if (lines.length > scopeLines) lines.push("");
      lines.push(formatMessage(args.recursive === true ? copy.indexNotesRecursive : copy.indexNotes, { count: direct.length }));
      lines.push(...direct.slice(0, limit).map(formatNoteLine));
      if (direct.length > limit) hints.push(formatMessage(copy.indexMore, { count: direct.length - limit }));
    }
  }

  const body = lines.length > MAX_INDEX_LINES ? lines.slice(0, MAX_INDEX_LINES) : lines;
  if (lines.length > MAX_INDEX_LINES) hints.push(formatMessage(copy.indexCut, { count: lines.length - MAX_INDEX_LINES }));
  const parts = [header, ...hints];
  if (body.length > scopeLines) parts.push(wrapUntrusted(body.join("\n")));
  return { isError: false, text: parts.join("\n") };
}

function countNotes(count: number): string {
  return count === 1 ? copy.oneNote : formatMessage(copy.manyNotes, { count });
}

function countFolders(count: number): string {
  return count === 1 ? copy.oneFolder : formatMessage(copy.manyFolders, { count });
}

function formatNoteLine(note: StoredNote): string {
  const name = note.path.split("/").at(-1) ?? note.path;
  const title = note.title !== name.replace(/\.md$/i, "") ? ` — ${note.title}` : "";
  const extras = [formatMessage(copy.noteChanged, { date: formatDay(note.changedAt) }), note.tags.length > 0 ? `#${note.tags.join(" #")}` : ""].filter(
    (part) => part !== "",
  );
  const description = note.description === null ? "" : `\n  ${note.description.replace(/\s+/g, " ")}`;
  return `- ${note.path}${title} (${extras.join(", ")})${description}`;
}

/** Every folder above a note, with the count of notes below it and the newest change; `""` is the top. */
function collectFolderStats(notes: readonly StoredNote[]): Map<string, FolderStats> {
  const stats = new Map<string, FolderStats>([["", { count: 0, updated: "" }]]);
  for (const note of notes) {
    const day = formatDay(note.changedAt);
    for (const folder of ["", ...ancestorsOf(parentOf(note.path))]) {
      const entry = stats.get(folder) ?? { count: 0, updated: "" };
      entry.count += 1;
      if (day > entry.updated) entry.updated = day;
      stats.set(folder, entry);
    }
  }
  return stats;
}

/** The description of each folder's own note (`Projects/Projects.md`), when it has one. */
function collectFolderDescriptions(notes: readonly StoredNote[]): Map<string, string> {
  const descriptions = new Map<string, string>();
  for (const note of notes) {
    const folder = parentOf(note.path);
    if (folder === "" || note.description === null) continue;
    const name = folder.split("/").at(-1) ?? folder;
    if (note.path.toLowerCase() === `${folder}/${name}.md`.toLowerCase()) descriptions.set(folder, note.description.replace(/\s+/g, " "));
  }
  return descriptions;
}

/** The folder the assistant named: exact, else folded for case and accents; `""` for the top; null when unknown. */
function resolveFolder(requested: string | undefined, stats: ReadonlyMap<string, FolderStats>): string | null {
  const folder = (requested ?? "").normalize("NFC").trim().replace(/^\/+|\/+$/g, "");
  if (folder === "" || folder === "." || folder === "/") return "";
  if (stats.has(folder)) return folder;
  const folded = foldText(folder);
  return [...stats.keys()].find((path) => path !== "" && foldText(path) === folded) ?? null;
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function ancestorsOf(folder: string): string[] {
  if (folder === "") return [];
  const segments = folder.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function byName(left: StoredNote, right: StoredNote): number {
  return left.path.localeCompare(right.path);
}

function byRecent(left: StoredNote, right: StoredNote): number {
  return right.changedAt.getTime() - left.changedAt.getTime() || byName(left, right);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatMinute(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

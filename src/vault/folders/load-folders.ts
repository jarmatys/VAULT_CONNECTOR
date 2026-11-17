// What the folder picker shows an account: its vault's folder tree read live from the source, and its picks. Picks
// whose folder has left the vault since are listed apart (they match no note); the next save drops them.
import type { Queryable } from "@softure-ai/db";
import type { SourceErrorCode } from "../sources/source.ts";
import { createAccountGithubSource, type GithubLinkContext } from "../sources/github/link.ts";
import { findSource, type StoredGithubSource } from "../sources/store.ts";
import { buildFolderTree, type FolderTree } from "./folder-tree.ts";
import { isUnderFolder, listSharedFolders } from "./shared-folders.ts";

export type FolderPicker =
  /** The account has connected no source yet. */
  | { readonly kind: "no_source" }
  /** This instance has no GitHub App, so the source cannot be read. */
  | { readonly kind: "unconfigured" }
  /** The source is marked disconnected, or answered that it is. */
  | { readonly kind: "disconnected"; readonly source: StoredGithubSource }
  /** The source failed to list the vault (rate limit, outage, a vault too large to list). */
  | { readonly kind: "failed"; readonly source: StoredGithubSource; readonly error: Exclude<SourceErrorCode, "source.disconnected"> }
  | {
      readonly kind: "ready";
      readonly source: StoredGithubSource;
      readonly tree: FolderTree;
      /** Picked folders that are in the tree now. */
      readonly picked: readonly string[];
      /** Picked folders the vault no longer has. */
      readonly missing: readonly string[];
    };

/** The account's folder picker; `ctx` is null when this instance has no GitHub App. */
export async function loadFolderPicker(
  db: Queryable,
  ctx: Pick<GithubLinkContext, "settings" | "fetch"> | null,
  userId: string,
): Promise<FolderPicker> {
  const source = await findSource(db, userId);
  if (source === null) return { kind: "no_source" };
  if (source.status === "disconnected") return { kind: "disconnected", source };
  if (ctx === null) return { kind: "unconfigured" };
  const listing = await createAccountGithubSource(ctx, source).listTree();
  if (!listing.ok) {
    return listing.error === "source.disconnected" ? { kind: "disconnected", source } : { kind: "failed", source, error: listing.error };
  }
  const tree = buildFolderTree(listing.value.files);
  const stored = (await listSharedFolders(db, userId)).map((folder) => folder.path);
  return {
    kind: "ready",
    source,
    tree,
    picked: stored.filter((path) => tree.paths.has(path)),
    missing: stored.filter((path) => !tree.paths.has(path)),
  };
}

/** Whether a folder of the tree is shared by a picked folder above it (shown ticked and locked). */
export function isIncludedByParent(path: string, picked: readonly string[]): boolean {
  return picked.some((folder) => isUnderFolder(path, folder));
}

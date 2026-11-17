// Table-of-contents rows for the tool tests, without a database: a path and what the sync would have read from it.
import type { StoredNote } from "../../vault/sync/sync-store.ts";

export function makeNote(path: string, fields: Partial<Omit<StoredNote, "path">> = {}): StoredNote {
  const name = path.split("/").at(-1) ?? path;
  return {
    path,
    version: `v-${path}`,
    size: 10,
    title: name.replace(/\.md$/i, ""),
    tags: [],
    aliases: [],
    description: null,
    changedAt: new Date("2026-11-10T08:00:00Z"),
    syncedAt: new Date("2026-11-17T12:00:00Z"),
    ...fields,
  };
}

// The three read-only tools an assistant gets (FR-13, FR-14, FR-15, FR-16): `vault_index`, `get_note`, `vault_status`.
// Each answer is built for one account from what it shares now (shared-notes.ts); every text taken from notes sits
// between the untrusted-data markers. No tool writes anything: they read the table of contents, the picks, the sync
// runs and the copies, never the source.
import { formatMessage } from "@softure-ai/core";
import type { Queryable } from "@softure-ai/db";
import type { FileStorage } from "@softure-ai/files";
import type { McpServer } from "@modelcontextprotocol/server";
import { toolError, toolResult, withToolErrors } from "@softure-ai/mcp-access/server";
import { z } from "zod";
import { en } from "../messages/en.ts";
import { findSource, getSourceLabel } from "../vault/sources/store.ts";
import { createAccountNoteStorage } from "../vault/storage/note-storage.ts";
import { findLatestRun, findOpenRun } from "../vault/sync/sync-store.ts";
import { loadSharedNotes, resolveNotePath, type SharedNotes } from "./shared-notes.ts";
import { wrapUntrusted } from "./untrusted.ts";
import { formatMinute, renderVaultIndex } from "./vault-index.ts";

/** What the tools read, resolved once per call (a listing of the tools opens nothing). */
export interface VaultReadContext {
  readonly db: Queryable;
  /** Null when the instance has no note store: nothing was synced and nothing can be read. */
  readonly storage: { readonly storage: FileStorage; readonly keySecret: string } | null;
  /** The panel's address, where the account connects a source and picks folders. */
  readonly panelUrl: string;
}

export type VaultReadContextReader = () => Promise<VaultReadContext>;

/** Notes longer than this many characters are cut, with a note saying so. */
export const MAX_NOTE_CHARACTERS = 60_000;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const tools = en.mcp.tools;
const copy = en.mcp.answers;

const vaultIndexInput = z.object({
  folder: z.string().max(1024).optional().describe(tools.vaultIndex.folder),
  filter: z.string().max(200).optional().describe(tools.vaultIndex.filter),
  depth: z.number().int().min(1).max(5).optional().describe(tools.vaultIndex.depth),
  recursive: z.boolean().optional().describe(tools.vaultIndex.recursive),
  sort: z.enum(["name", "recent"]).optional().describe(tools.vaultIndex.sort),
  max_results: z.number().int().min(1).max(500).optional().describe(tools.vaultIndex.maxResults),
});

const getNoteInput = z.object({ path: z.string().max(1024).describe(tools.getNote.path) });

export function registerVaultTools(server: McpServer, input: { readonly userId: string; readonly getContext: VaultReadContextReader }): void {
  const { userId, getContext } = input;

  server.registerTool(
    "vault_index",
    { title: tools.vaultIndex.title, description: tools.vaultIndex.description, inputSchema: vaultIndexInput, annotations: { title: tools.vaultIndex.title, ...READ_ONLY } },
    (args) =>
      withToolErrors(
        async () => {
          const ctx = await getContext();
          const shared = await loadSharedNotes(ctx.db, userId);
          const blocked = await explainEmpty(ctx, userId, shared);
          if (blocked !== null) return toolError(blocked);
          const latest = await findLatestRun(ctx.db, userId);
          const answer = renderVaultIndex(
            shared.notes,
            { folder: args.folder, filter: args.filter, depth: args.depth, recursive: args.recursive, sort: args.sort, maxResults: args.max_results },
            latest?.finishedAt ?? null,
          );
          return answer.isError ? toolError(answer.text) : toolResult(answer.text);
        },
        { label: "vault_index" },
      ),
  );

  server.registerTool(
    "get_note",
    { title: tools.getNote.title, description: tools.getNote.description, inputSchema: getNoteInput, annotations: { title: tools.getNote.title, ...READ_ONLY } },
    (args) =>
      withToolErrors(
        async () => {
          if (args.path.trim() === "") return toolError(copy.noteRequired);
          const ctx = await getContext();
          const shared = await loadSharedNotes(ctx.db, userId);
          const blocked = await explainEmpty(ctx, userId, shared);
          if (blocked !== null) return toolError(blocked);
          const note = resolveNotePath(args.path, shared.notes);
          if (note === null || ctx.storage === null) return toolError(formatMessage(copy.noteNotFound, { path: args.path }));
          const bytes = await createAccountNoteStorage(ctx.storage.storage, ctx.storage.keySecret, userId).readNote(note.path);
          if (bytes === null) return toolError(formatMessage(copy.noteMissing, { path: note.path }));
          return toolResult(wrapUntrusted(`# ${note.path}\n\n${cutNote(new TextDecoder().decode(bytes))}`));
        },
        { label: "get_note" },
      ),
  );

  server.registerTool(
    "vault_status",
    { title: tools.vaultStatus.title, description: tools.vaultStatus.description, annotations: { title: tools.vaultStatus.title, ...READ_ONLY } },
    () => withToolErrors(async () => toolResult(await describeStatus(await getContext(), userId)), { label: "vault_status" }),
  );
}

/** The note's text, cut at the limit (by characters, never inside one) with a line saying so. */
export function cutNote(text: string): string {
  const characters = [...text];
  if (characters.length <= MAX_NOTE_CHARACTERS) return text;
  return `${characters.slice(0, MAX_NOTE_CHARACTERS).join("")}\n\n${formatMessage(copy.noteCut, { max: MAX_NOTE_CHARACTERS })}`;
}

/** Why there is nothing to read yet, or null when there is: no store, no source, no pick, first copy running. */
async function explainEmpty(ctx: VaultReadContext, userId: string, shared: SharedNotes): Promise<string | null> {
  if (ctx.storage === null) return copy.unconfigured;
  if (shared.notes.length > 0) return null;
  if ((await findSource(ctx.db, userId)) === null) return formatMessage(copy.noSource, { panelUrl: ctx.panelUrl });
  if (shared.folders.length === 0) return formatMessage(copy.noPicks, { panelUrl: ctx.panelUrl });
  if ((await findLatestRun(ctx.db, userId))?.status !== "succeeded") return copy.firstSync;
  return null;
}

async function describeStatus(ctx: VaultReadContext, userId: string): Promise<string> {
  const source = await findSource(ctx.db, userId);
  const shared = await loadSharedNotes(ctx.db, userId);
  const latest = await findLatestRun(ctx.db, userId);
  const open = await findOpenRun(ctx.db, userId);
  const vaultLines = [
    source === null
      ? copy.statusNoSource
      : formatMessage(copy.statusSource, {
          name: getSourceLabel(source),
          state: source.status === "connected" ? copy.statusConnected : copy.statusDisconnected,
        }),
    shared.folders.length === 0 ? copy.statusNoFolders : formatMessage(copy.statusFolders, { folders: shared.folders.join(", ") }),
  ];
  const lines = [wrapUntrusted(vaultLines.join("\n")), formatMessage(copy.statusNotes, { count: shared.notes.length })];
  const finishedAt = latest?.finishedAt ?? null;
  lines.push(
    latest === null || finishedAt === null
      ? copy.statusNeverSynced
      : formatMessage(copy.statusLastSync, {
          time: formatMinute(finishedAt),
          outcome: latest.status === "succeeded" ? copy.statusSucceeded : formatMessage(copy.statusFailed, { code: latest.errorCode ?? "" }),
        }),
  );
  if (open !== null) {
    lines.push(formatMessage(copy.statusSyncing, { done: open.copied + open.removed, total: open.plannedCopies + open.plannedRemovals }));
  }
  if (ctx.storage === null) lines.push(copy.unconfigured);
  lines.push(formatMessage(copy.statusPanel, { panelUrl: ctx.panelUrl }));
  return lines.join("\n");
}

// The folder picker (VC-7): the connected vault's folder tree with note counts, nothing ticked until the account
// picks. A ticked folder shares everything below it; folders under a ticked folder show as included. Saving replaces
// the whole pick. The tree is read from the source on each visit.
import { requireUser } from "@softure-ai/auth/next";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ICON_STROKE_WIDTH,
  PageHeader,
} from "@softure-ai/theme-notion";
import { FolderIcon } from "lucide-react";
import Link from "next/link";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { en } from "../../../../messages/en.ts";
import { FOLDER_FIELD_PREFIX, FOLDERS_PATH, readFolderSaveError } from "../../../../vault/folders/folder-paths.ts";
import type { FolderNode } from "../../../../vault/folders/folder-tree.ts";
import { isIncludedByParent, loadFolderPicker, type FolderPicker } from "../../../../vault/folders/load-folders.ts";
import { getRequestSourceOpener } from "../../../../vault/sources/request-opener.ts";
import { SOURCE_PATH } from "../../../../vault/sources/source-paths.ts";
import { getSourceLabel } from "../../../../vault/sources/store.ts";
import { saveFoldersAction } from "./actions.ts";

export const dynamic = "force-dynamic";

interface FoldersPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function FoldersPage({ searchParams }: FoldersPageProps) {
  const user = await requireUser({ next: FOLDERS_PATH });
  const query = await searchParams;
  const saveError = readFolderSaveError(query.error);
  const isSaved = query.saved === "1" && saveError === null;
  const picker = await loadFolderPicker(await getRequestDatabase(), getRequestSourceOpener(), user.id);

  return (
    <main className="grid gap-8">
      <PageHeader title={en.folders.title} description={en.folders.lead} />
      {saveError !== null && (
        <p role="alert" className="rounded-lg bg-red-bg px-4 py-3 text-body text-red" data-testid="folders-error">
          {en.folders.errors[saveError]}
        </p>
      )}
      {isSaved && picker.kind === "ready" && (
        <p role="status" className="rounded-lg bg-green-bg px-4 py-3 text-body text-green" data-testid="folders-saved">
          {en.folders.saved}
        </p>
      )}
      <PickerBody picker={picker} />
    </main>
  );
}

function PickerBody({ picker }: { readonly picker: FolderPicker }) {
  switch (picker.kind) {
    case "no_source":
      return <Notice text={en.folders.noSource} action={en.folders.noSourceAction} testId="folders-no-source" />;
    case "unconfigured":
      return (
        <p className="text-body text-muted-foreground" data-testid="folders-unconfigured">
          {en.folders.unconfigured}
        </p>
      );
    case "disconnected":
      return <Notice text={en.folders.disconnected} action={en.folders.reconnectAction} testId="folders-disconnected" />;
    case "failed":
      return (
        <p role="alert" className="rounded-lg bg-red-bg px-4 py-3 text-body text-red" data-testid="folders-failed">
          {en.folders.failed[picker.error]}
        </p>
      );
    case "ready":
      return <PickerForm picker={picker} />;
  }
}

function Notice({ text, action, testId }: { readonly text: string; readonly action: string; readonly testId: string }) {
  return (
    <div className="grid gap-4" data-testid={testId}>
      <p className="text-body">{text}</p>
      <div>
        <Button asChild size="lg">
          <Link href={SOURCE_PATH}>{action}</Link>
        </Button>
      </div>
    </div>
  );
}

function PickerForm({ picker }: { readonly picker: Extract<FolderPicker, { kind: "ready" }> }) {
  const { tree, picked, missing, source } = picker;
  return (
    <Card>
      <form action={saveFoldersAction} className="grid gap-6" data-testid="folders-form">
        <CardHeader>
          <CardTitle className="text-heading-3">{en.folders.treeLabel}</CardTitle>
          <CardDescription>
            {en.folders.from} <span className="font-mono text-foreground">{getSourceLabel(source)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {tree.folders.length === 0 ? (
            <p className="text-body" data-testid="folders-empty">
              {en.folders.empty}
            </p>
          ) : (
            <fieldset aria-label={en.folders.treeLabel}>
              <FolderList folders={tree.folders} picked={picked} />
            </fieldset>
          )}
          {picked.length === 0 && (
            <p className="text-small text-muted-foreground" data-testid="folders-none-shared">
              {en.folders.noneShared}
            </p>
          )}
          {tree.topLevelNoteCount > 0 && (
            <p className="text-small text-muted-foreground" data-testid="folders-top-level">
              {en.folders.topLevel} {formatNotes(tree.topLevelNoteCount)}
            </p>
          )}
          {missing.length > 0 && (
            <div className="grid gap-1" data-testid="folders-missing">
              <p className="text-small text-muted-foreground">{en.folders.missing}</p>
              <ul className="grid gap-0.5 font-mono text-small">
                {missing.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" size="lg">
            {en.folders.save}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function FolderList({ folders, picked }: { readonly folders: readonly FolderNode[]; readonly picked: readonly string[] }) {
  return (
    <ul className="grid">
      {folders.map((folder) => (
        <FolderItem key={folder.path} folder={folder} picked={picked} />
      ))}
    </ul>
  );
}

/** One folder as a row: the theme's checkbox, the name, the note count; its subfolders indented below it. */
function FolderItem({ folder, picked }: { readonly folder: FolderNode; readonly picked: readonly string[] }) {
  const isIncluded = isIncludedByParent(folder.path, picked);
  const isPicked = picked.includes(folder.path);
  return (
    <li className="grid" data-testid="folder-item" data-path={folder.path}>
      <label className="flex min-h-row-height cursor-pointer items-center gap-2 rounded-md px-2 text-ui hover:bg-accent has-disabled:cursor-default">
        <Checkbox name={`${FOLDER_FIELD_PREFIX}${folder.path}`} defaultChecked={isPicked || isIncluded} disabled={isIncluded} />
        <FolderIcon aria-hidden strokeWidth={ICON_STROKE_WIDTH} className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{folder.name}</span>
        <span className="text-small text-muted-foreground" data-testid="folder-count">
          {formatNotes(folder.noteCount)}
        </span>
        {isIncluded && <span className="text-small text-muted-foreground">({en.folders.included})</span>}
      </label>
      {folder.children.length > 0 && (
        <div className="pl-6">
          <FolderList folders={folder.children} picked={picked} />
        </div>
      )}
    </li>
  );
}

function formatNotes(count: number): string {
  return `${String(count)} ${count === 1 ? en.folders.note : en.folders.notes}`;
}

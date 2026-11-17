// The folder picker (VC-7): the connected vault's folder tree with note counts, nothing ticked until the account
// picks. A ticked folder shares everything below it; folders under a ticked folder show as included. Saving replaces
// the whole pick. The tree is read from the source on each visit.
import { requireUser } from "@softure-ai/auth/next";
import { BUTTON_VARIANT_LOOK, CARD_TITLE_LOOK, CHECKBOX_LOOK } from "@softure-ai/theme-flat-paint";
import { Button, ButtonAnchor, Card, Checkbox } from "@softure-ai/ui";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { en } from "../../../../messages/en.ts";
import { FOLDER_FIELD_PREFIX, FOLDERS_PATH, readFolderSaveError } from "../../../../vault/folders/folder-paths.ts";
import type { FolderNode } from "../../../../vault/folders/folder-tree.ts";
import { isIncludedByParent, loadFolderPicker, type FolderPicker } from "../../../../vault/folders/load-folders.ts";
import { getGithubLinkContext } from "../../../../vault/sources/github/request-context.ts";
import { SOURCE_PATH } from "../../../../vault/sources/source-paths.ts";
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
  const picker = await loadFolderPicker(await getRequestDatabase(), await getGithubLinkContext(), user.id);

  return (
    <main className="grid gap-6">
      <h1 className="text-display">{en.folders.title}</h1>
      <p className="text-body">{en.folders.lead}</p>
      {saveError !== null && (
        <p role="alert" className="text-body text-destructive" data-testid="folders-error">
          {en.folders.errors[saveError]}
        </p>
      )}
      {isSaved && picker.kind === "ready" && (
        <p role="status" className="text-body" data-testid="folders-saved">
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
        <p className="text-body" data-testid="folders-unconfigured">
          {en.folders.unconfigured}
        </p>
      );
    case "disconnected":
      return <Notice text={en.folders.disconnected} action={en.folders.reconnectAction} testId="folders-disconnected" />;
    case "failed":
      return (
        <p role="alert" className="text-body text-destructive" data-testid="folders-failed">
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
        <ButtonAnchor variant="primary" href={SOURCE_PATH} className={BUTTON_VARIANT_LOOK.primary}>
          {action}
        </ButtonAnchor>
      </div>
    </div>
  );
}

function PickerForm({ picker }: { readonly picker: Extract<FolderPicker, { kind: "ready" }> }) {
  const { tree, picked, missing, source } = picker;
  return (
    <Card variant="lead" title={en.folders.treeLabel} classNames={{ title: CARD_TITLE_LOOK.card }}>
      <form action={saveFoldersAction} className="grid gap-4" data-testid="folders-form">
        <p className="text-body-sm text-muted">
          {en.folders.from} <span className="text-foreground">{source.repositoryFullName}</span>
        </p>
        {tree.folders.length === 0 ? (
          <p className="text-body" data-testid="folders-empty">
            {en.folders.empty}
          </p>
        ) : (
          <fieldset className="grid gap-2" aria-label={en.folders.treeLabel}>
                        <FolderList folders={tree.folders} picked={picked} />
          </fieldset>
        )}
        {picked.length === 0 && (
          <p className="text-body-sm text-muted" data-testid="folders-none-shared">
            {en.folders.noneShared}
          </p>
        )}
        {tree.topLevelNoteCount > 0 && (
          <p className="text-body-sm text-muted" data-testid="folders-top-level">
            {en.folders.topLevel} {formatNotes(tree.topLevelNoteCount)}
          </p>
        )}
        {missing.length > 0 && (
          <div className="grid gap-1" data-testid="folders-missing">
            <p className="text-body-sm text-muted">{en.folders.missing}</p>
            <ul className="text-body-sm">
              {missing.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <Button type="submit" variant="primary" className={BUTTON_VARIANT_LOOK.primary}>
            {en.folders.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FolderList({ folders, picked }: { readonly folders: readonly FolderNode[]; readonly picked: readonly string[] }) {
  return (
    <ul className="grid gap-2">
      {folders.map((folder) => (
        <FolderItem key={folder.path} folder={folder} picked={picked} />
      ))}
    </ul>
  );
}

function FolderItem({ folder, picked }: { readonly folder: FolderNode; readonly picked: readonly string[] }) {
  const isIncluded = isIncludedByParent(folder.path, picked);
  const isPicked = picked.includes(folder.path);
  return (
    <li className="grid gap-2" data-testid="folder-item" data-path={folder.path}>
      <Checkbox
        name={`${FOLDER_FIELD_PREFIX}${folder.path}`}
        defaultChecked={isPicked || isIncluded}
        disabled={isIncluded}
        unstyled
        classNames={CHECKBOX_LOOK}
        label={
          <span className="flex flex-wrap items-baseline gap-2 text-body">
            <span className="text-foreground">{folder.name}</span>
            <span className="text-body-sm text-muted" data-testid="folder-count">
              {formatNotes(folder.noteCount)}
            </span>
            {isIncluded && <span className="text-body-sm text-muted">({en.folders.included})</span>}
          </span>
        }
      />
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

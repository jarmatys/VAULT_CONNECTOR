// The panel of a new account: its next steps and nothing else to configure (FR-5). The first leads to the vault
// source screen and names the repository once one is connected; the second, once a source is connected, leads to the
// folder picker and says how many folders are shared.
import { requireUser } from "@softure-ai/auth/next";
import { BUTTON_VARIANT_LOOK, CARD_STEP_LOOK, CARD_TITLE_LOOK } from "@softure-ai/theme-flat-paint";
import { ButtonAnchor, Card } from "@softure-ai/ui";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { en } from "../../../messages/en.ts";
import { PANEL_PATH } from "../../../panel-paths.ts";
import { FOLDERS_PATH } from "../../../vault/folders/folder-paths.ts";
import { listSharedFolders } from "../../../vault/folders/shared-folders.ts";
import { SOURCE_PATH } from "../../../vault/sources/source-paths.ts";
import { findSource } from "../../../vault/sources/store.ts";

export default async function PanelPage() {
  const user = await requireUser({ next: PANEL_PATH });
  const db = await getRequestDatabase();
  const source = await findSource(db, user.id);
  const sharedCount = source === null ? 0 : (await listSharedFolders(db, user.id)).length;
  return (
    <main className="grid gap-6">
      <h1 className="text-display">{en.panel.title}</h1>
      <section aria-label={en.panel.nextStepLabel} className="grid gap-6">
        <Card
          variant="lead"
          step={1}
          title={en.panel.nextStepTitle}
          classNames={{ title: CARD_TITLE_LOOK.card, step: CARD_STEP_LOOK }}
        >
          <div className="grid gap-4">
            <p className="text-body">{en.panel.nextStepBody}</p>
            {source !== null && (
              <p className="text-body" data-testid="panel-source">
                {en.panel.nextStepConnected} <span className="text-foreground">{source.repositoryFullName}</span>
              </p>
            )}
            <div>
              <ButtonAnchor variant="primary" href={SOURCE_PATH} className={BUTTON_VARIANT_LOOK.primary}>
                {source === null ? en.panel.nextStepAction : en.panel.nextStepManage}
              </ButtonAnchor>
            </div>
          </div>
        </Card>
        {source !== null && (
          <Card
            variant="lead"
            step={2}
            title={en.panel.foldersStepTitle}
            classNames={{ title: CARD_TITLE_LOOK.card, step: CARD_STEP_LOOK }}
          >
            <div className="grid gap-4">
              <p className="text-body">{en.panel.foldersStepBody}</p>
              <p className="text-body" data-testid="panel-folders">
                {en.panel.foldersStepCount} <span className="text-foreground">{String(sharedCount)}</span>
              </p>
              <div>
                <ButtonAnchor variant="primary" href={FOLDERS_PATH} className={BUTTON_VARIANT_LOOK.primary}>
                  {en.panel.foldersStepAction}
                </ButtonAnchor>
              </div>
            </div>
          </Card>
        )}
      </section>
    </main>
  );
}

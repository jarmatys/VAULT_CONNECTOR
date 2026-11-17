// The panel of a new account: one next step and nothing else to configure (FR-5). The step leads to the vault
// source screen, and names the repository once one is connected.
import { requireUser } from "@softure-ai/auth/next";
import { BUTTON_VARIANT_LOOK, CARD_STEP_LOOK, CARD_TITLE_LOOK } from "@softure-ai/theme-flat-paint";
import { ButtonAnchor, Card } from "@softure-ai/ui";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { en } from "../../../messages/en.ts";
import { PANEL_PATH } from "../../../panel-paths.ts";
import { SOURCE_PATH } from "../../../vault/sources/source-paths.ts";
import { findSource } from "../../../vault/sources/store.ts";

export default async function PanelPage() {
  const user = await requireUser({ next: PANEL_PATH });
  const source = await findSource(await getRequestDatabase(), user.id);
  return (
    <main className="grid gap-6">
      <h1 className="text-display">{en.panel.title}</h1>
      <section aria-label={en.panel.nextStepLabel}>
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
      </section>
    </main>
  );
}

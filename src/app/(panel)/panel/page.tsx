// The panel of a new account: one next step and nothing else to configure (FR-5). Connecting the vault's repository
// is VC-6's screen; until it exists the step names what comes, without a link.
import { CARD_STEP_LOOK, CARD_TITLE_LOOK } from "@softure-ai/theme-flat-paint";
import { Card } from "@softure-ai/ui";
import { en } from "../../../messages/en.ts";

export default function PanelPage() {
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
          <p className="text-body">{en.panel.nextStepBody}</p>
          <p className="text-body-sm text-muted">{en.panel.nextStepSoon}</p>
        </Card>
      </section>
    </main>
  );
}

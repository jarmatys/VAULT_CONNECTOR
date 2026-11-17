// The panel of a new account: its next steps and nothing else to configure (FR-5). The first leads to the vault
// source screen and names the repository once one is connected; the second, once a source is connected, leads to the
// folder picker and says how many folders are shared; the third, once a folder is shared, leads to "Connect Claude".
import { requireUser } from "@softure-ai/auth/next";
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, PageHeader } from "@softure-ai/theme-notion";
import Link from "next/link";
import type { ReactNode } from "react";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { en } from "../../../messages/en.ts";
import { CONNECTORS_PATH, PANEL_PATH } from "../../../panel-paths.ts";
import { FOLDERS_PATH } from "../../../vault/folders/folder-paths.ts";
import { listSharedFolders } from "../../../vault/folders/shared-folders.ts";
import { SOURCE_PATH } from "../../../vault/sources/source-paths.ts";
import { findSource, getSourceLabel } from "../../../vault/sources/store.ts";

export default async function PanelPage() {
  const user = await requireUser({ next: PANEL_PATH });
  const db = await getRequestDatabase();
  const source = await findSource(db, user.id);
  const sharedCount = source === null ? 0 : (await listSharedFolders(db, user.id)).length;
  return (
    <main className="grid gap-8">
      <PageHeader title={en.panel.title} />
      <section aria-label={en.panel.nextStepLabel} className="grid gap-3">
        <h2 className="text-section-label text-muted-foreground">{en.panel.nextStepLabel}</h2>
        <StepCard
          step={1}
          title={en.panel.nextStepTitle}
          action={{ href: SOURCE_PATH, label: source === null ? en.panel.nextStepAction : en.panel.nextStepManage }}
          isPrimary={source === null}
        >
          <p>{en.panel.nextStepBody}</p>
          {source !== null && (
            <p data-testid="panel-source">
              {en.panel.nextStepConnected} <span className="font-mono font-medium">{getSourceLabel(source)}</span>
            </p>
          )}
        </StepCard>
        {source !== null && (
          <StepCard
            step={2}
            title={en.panel.foldersStepTitle}
            action={{ href: FOLDERS_PATH, label: en.panel.foldersStepAction }}
            isPrimary={sharedCount === 0}
          >
            <p>{en.panel.foldersStepBody}</p>
            <p data-testid="panel-folders">
              {en.panel.foldersStepCount} <span className="font-medium">{String(sharedCount)}</span>
            </p>
          </StepCard>
        )}
        {sharedCount > 0 && (
          <StepCard step={3} title={en.panel.connectStepTitle} action={{ href: CONNECTORS_PATH, label: en.panel.connectStepAction }} isPrimary>
            <p>{en.panel.connectStepBody}</p>
          </StepCard>
        )}
      </section>
    </main>
  );
}

interface StepCardProps {
  readonly step: number;
  readonly title: string;
  readonly action: { readonly href: string; readonly label: string };
  /** The one primary action on the screen; the other steps' actions are secondary (DESIGN.md). */
  readonly isPrimary: boolean;
  readonly children: ReactNode;
}

/** One numbered step: its number in a grey box, the title, what it does, and the button that leads to it. */
function StepCard({ step, title, action, isPrimary, children }: StepCardProps) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-small font-medium text-muted-foreground">
          {step}
        </span>
        <CardTitle className="text-heading-3">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-body">{children}</CardContent>
      <CardFooter>
        <Button asChild size="lg" variant={isPrimary ? "default" : "secondary"}>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

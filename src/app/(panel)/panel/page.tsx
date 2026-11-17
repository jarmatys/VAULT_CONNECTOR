// The panel of a new account: one next step and nothing else to configure (FR-5). The step leads to the vault
// source screen, and names the repository once one is connected.
import { requireUser } from "@softure-ai/auth/next";
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, PageHeader } from "@softure-ai/theme-notion";
import Link from "next/link";
import { getRequestDatabase } from "../../../auth/module-context.ts";
import { en } from "../../../messages/en.ts";
import { PANEL_PATH } from "../../../panel-paths.ts";
import { SOURCE_PATH } from "../../../vault/sources/source-paths.ts";
import { findSource } from "../../../vault/sources/store.ts";

export default async function PanelPage() {
  const user = await requireUser({ next: PANEL_PATH });
  const source = await findSource(await getRequestDatabase(), user.id);
  return (
    <main className="grid gap-8">
      <PageHeader title={en.panel.title} />
      <section aria-label={en.panel.nextStepLabel} className="grid gap-2">
        <h2 className="text-section-label text-muted-foreground">{en.panel.nextStepLabel}</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-3">{en.panel.nextStepTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-body">
            <p>{en.panel.nextStepBody}</p>
            {source !== null && (
              <p data-testid="panel-source">
                {en.panel.nextStepConnected} <span className="font-medium">{source.repositoryFullName}</span>
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button asChild size="lg">
              <Link href={SOURCE_PATH}>{source === null ? en.panel.nextStepAction : en.panel.nextStepManage}</Link>
            </Button>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}

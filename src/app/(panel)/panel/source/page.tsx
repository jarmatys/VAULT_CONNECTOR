// The account's vault source (VC-6): connect one GitHub repository through the product's App, see which one is
// connected, notice when GitHub took the access away, disconnect. Opening the screen re-checks a saved link with
// GitHub (at most once a minute), so an App uninstalled on GitHub shows as disconnected here.
import { requireUser } from "@softure-ai/auth/next";
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, PageHeader, Status } from "@softure-ai/theme-notion";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { en } from "../../../../messages/en.ts";
import { checkGithubSource, isSourceCheckDue } from "../../../../vault/sources/github/link.ts";
import { getGithubLinkContext } from "../../../../vault/sources/github/request-context.ts";
import { readLinkError, SOURCE_PATH } from "../../../../vault/sources/source-paths.ts";
import { findSource, type StoredGithubSource } from "../../../../vault/sources/store.ts";
import { connectGithubAction, disconnectSourceAction } from "./actions.ts";

export const dynamic = "force-dynamic";

interface SourcePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function SourcePage({ searchParams }: SourcePageProps) {
  const user = await requireUser({ next: SOURCE_PATH });
  const query = await searchParams;
  const linkError = readLinkError(query.error);
  const isLinked = query.linked === "1" && linkError === null;
  const ctx = await getGithubLinkContext();
  const stored = await findSource(ctx?.db ?? (await getRequestDatabase()), user.id);
  const source = stored !== null && ctx !== null && isSourceCheckDue(stored, ctx.clock.now()) ? await checkGithubSource(ctx, user.id, stored) : stored;

  return (
    <main className="grid gap-8">
      <PageHeader title={en.source.title} description={en.source.lead} />
      {linkError !== null && (
        <p role="alert" className="rounded-lg bg-red-bg px-4 py-3 text-body text-red" data-testid="source-error">
          {en.source.errors[linkError]}
        </p>
      )}
      {isLinked && source?.status === "connected" && (
        <p role="status" className="rounded-lg bg-green-bg px-4 py-3 text-body text-green" data-testid="source-linked">
          {en.source.linked}
        </p>
      )}
      {source === null ? <ConnectCard isConfigured={ctx !== null} /> : <SourceCard source={source} canReconnect={ctx !== null} />}
    </main>
  );
}

function ConnectCard({ isConfigured }: { readonly isConfigured: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-3">{en.source.connectTitle}</CardTitle>
      </CardHeader>
      {isConfigured ? (
        <form action={connectGithubAction} className="grid gap-6">
          <CardContent className="text-body">
            <p>{en.source.connectBody}</p>
          </CardContent>
          <CardFooter>
            <Button type="submit" size="lg">
              {en.source.connectAction}
            </Button>
          </CardFooter>
        </form>
      ) : (
        <CardContent className="text-body text-muted-foreground">
          <p data-testid="source-unconfigured">{en.source.unconfigured}</p>
        </CardContent>
      )}
    </Card>
  );
}

function SourceCard({ source, canReconnect }: { readonly source: StoredGithubSource; readonly canReconnect: boolean }) {
  const isConnected = source.status === "connected";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-heading-3">
          {isConnected ? (
            <Status color="green" icon={CircleCheckIcon}>
              {en.source.connectedTitle}
            </Status>
          ) : (
            <Status color="red" icon={CircleXIcon}>
              {en.source.disconnectedTitle}
            </Status>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-body" data-testid="source-card" data-status={source.status}>
        {isConnected ? (
          <p>
            {en.source.connectedBody}{" "}
            <span className="font-mono font-medium" data-testid="source-repository">
              {source.repositoryFullName}
            </span>
            . {en.source.branch}: <span className="font-mono">{source.defaultBranch}</span>.
          </p>
        ) : (
          <p>
            <span className="font-mono font-medium" data-testid="source-repository">
              {source.repositoryFullName}
            </span>
            : {en.source.disconnectedBody}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!isConnected && canReconnect && (
            <form action={connectGithubAction}>
              <Button type="submit" size="lg">
                {en.source.reconnectAction}
              </Button>
            </form>
          )}
          <form action={disconnectSourceAction}>
            <Button type="submit" variant="outline" size="lg">
              {en.source.disconnectAction}
            </Button>
          </form>
        </div>
        <p className="text-small text-muted-foreground">{en.source.disconnectNote}</p>
      </CardContent>
    </Card>
  );
}

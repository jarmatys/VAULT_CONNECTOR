// The account's vault source (VC-6): connect one GitHub repository through the product's App, see which one is
// connected, notice when GitHub took the access away, disconnect. Opening the screen re-checks a saved link with
// GitHub (at most once a minute), so an App uninstalled on GitHub shows as disconnected here.
import { requireUser } from "@softure-ai/auth/next";
import { BUTTON_VARIANT_LOOK, CARD_TITLE_LOOK } from "@softure-ai/theme-flat-paint";
import { Button, Card } from "@softure-ai/ui";
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
    <main className="grid gap-6">
      <h1 className="text-display">{en.source.title}</h1>
      <p className="text-body">{en.source.lead}</p>
      {linkError !== null && (
        <p role="alert" className="text-body text-destructive" data-testid="source-error">
          {en.source.errors[linkError]}
        </p>
      )}
      {isLinked && source?.status === "connected" && (
        <p role="status" className="text-body" data-testid="source-linked">
          {en.source.linked}
        </p>
      )}
      {source === null ? <ConnectCard isConfigured={ctx !== null} /> : <SourceCard source={source} canReconnect={ctx !== null} />}
    </main>
  );
}

function ConnectCard({ isConfigured }: { readonly isConfigured: boolean }) {
  return (
    <Card variant="lead" title={en.source.connectTitle} classNames={{ title: CARD_TITLE_LOOK.card }}>
      {isConfigured ? (
        <form action={connectGithubAction} className="grid gap-4">
          <p className="text-body">{en.source.connectBody}</p>
          <div>
            <Button type="submit" variant="primary" className={BUTTON_VARIANT_LOOK.primary}>
              {en.source.connectAction}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-body" data-testid="source-unconfigured">
          {en.source.unconfigured}
        </p>
      )}
    </Card>
  );
}

function SourceCard({ source, canReconnect }: { readonly source: StoredGithubSource; readonly canReconnect: boolean }) {
  const isConnected = source.status === "connected";
  return (
    <Card
      variant="lead"
      title={isConnected ? en.source.connectedTitle : en.source.disconnectedTitle}
      classNames={{ title: CARD_TITLE_LOOK.card }}
    >
      <div className="grid gap-4" data-testid="source-card" data-status={source.status}>
        {isConnected ? (
          <p className="text-body">
            {en.source.connectedBody}{" "}
            <span className="text-foreground" data-testid="source-repository">
              {source.repositoryFullName}
            </span>
            . {en.source.branch}: {source.defaultBranch}.
          </p>
        ) : (
          <p className="text-body">
            <span className="text-foreground" data-testid="source-repository">
              {source.repositoryFullName}
            </span>
            : {en.source.disconnectedBody}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {!isConnected && canReconnect && (
            <form action={connectGithubAction}>
              <Button type="submit" variant="primary" className={BUTTON_VARIANT_LOOK.primary}>
                {en.source.reconnectAction}
              </Button>
            </form>
          )}
          <form action={disconnectSourceAction}>
            <Button type="submit" variant="secondary" className={BUTTON_VARIANT_LOOK.secondary}>
              {en.source.disconnectAction}
            </Button>
          </form>
        </div>
        <p className="text-body-sm text-muted">{en.source.disconnectNote}</p>
      </div>
    </Card>
  );
}

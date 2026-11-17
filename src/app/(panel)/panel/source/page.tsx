// The account's vault source (VC-6): connect one GitHub repository through the product's App, see which one is
// connected, notice when GitHub took the access away, disconnect. Opening the screen re-checks a saved link with
// GitHub (at most once a minute), so an App uninstalled on GitHub shows as disconnected here. VC-20 adds an
// S3-compatible bucket as the second kind: its card links to the form, and a refused key shows as disconnected. VC-21
// adds a Dropbox folder as the third: its card links to the folder form, and a revoked grant shows as disconnected.
import { requireUser } from "@softure-ai/auth/next";
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, PageHeader, Status } from "@softure-ai/theme-notion";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import Link from "next/link";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { en } from "../../../../messages/en.ts";
import { checkGithubSource, isSourceCheckDue } from "../../../../vault/sources/github/link.ts";
import { getGithubLinkContext } from "../../../../vault/sources/github/request-context.ts";
import { readDropboxSourceSettings, readS3SourceSettings } from "../../../../vault/settings.ts";
import { DROPBOX_SOURCE_PATH, readLinkError, S3_SOURCE_PATH, SOURCE_PATH } from "../../../../vault/sources/source-paths.ts";
import { findSource, getSourceLabel, type StoredDropboxSource, type StoredGithubSource, type StoredS3Source } from "../../../../vault/sources/store.ts";
import { connectGithubAction, disconnectSourceAction } from "./actions.ts";

export const dynamic = "force-dynamic";

interface SourcePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function SourcePage({ searchParams }: SourcePageProps) {
  const user = await requireUser({ next: SOURCE_PATH });
  const query = await searchParams;
  const linkError = readLinkError(query.error);
  const isLinked = (query.linked === "1" || query.linked === "s3" || query.linked === "dropbox") && linkError === null;
  const isS3Configured = readS3SourceSettings(process.env).kind === "configured";
  const isDropboxConfigured = readDropboxSourceSettings(process.env).kind === "configured";
  const ctx = await getGithubLinkContext();
  const stored = await findSource(ctx?.db ?? (await getRequestDatabase()), user.id);
  const source =
    stored?.kind === "github" && ctx !== null && isSourceCheckDue(stored, ctx.clock.now()) ? await checkGithubSource(ctx, user.id, stored) : stored;

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
          {source.kind === "s3" ? en.s3.linked : source.kind === "dropbox" ? en.dropbox.linked : en.source.linked}
        </p>
      )}
      {source === null && (
        <>
          <ConnectCard isConfigured={ctx !== null} />
          <S3ConnectCard isConfigured={isS3Configured} />
          <DropboxConnectCard isConfigured={isDropboxConfigured} />
        </>
      )}
      {source?.kind === "github" && <SourceCard source={source} canReconnect={ctx !== null} />}
      {source?.kind === "s3" && <S3SourceCard source={source} canChangeKeys={isS3Configured} />}
      {source?.kind === "dropbox" && <DropboxSourceCard source={source} canRelink={isDropboxConfigured} />}
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

function S3ConnectCard({ isConfigured }: { readonly isConfigured: boolean }) {
  return (
    <Card data-testid="s3-connect-card">
      <CardHeader>
        <CardTitle className="text-heading-3">{en.s3.cardTitle}</CardTitle>
      </CardHeader>
      {isConfigured ? (
        <>
          <CardContent className="text-body">
            <p>{en.s3.cardBody}</p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="lg">
              <Link href={S3_SOURCE_PATH}>{en.s3.cardAction}</Link>
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardContent className="text-body text-muted-foreground">
          <p data-testid="s3-unconfigured">{en.s3.unconfigured}</p>
        </CardContent>
      )}
    </Card>
  );
}

function S3SourceCard({ source, canChangeKeys }: { readonly source: StoredS3Source; readonly canChangeKeys: boolean }) {
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
      <CardContent className="grid gap-4 text-body" data-testid="source-card" data-status={source.status} data-kind="s3">
        {isConnected ? (
          <p>
            {en.s3.connectedBody}{" "}
            <span className="font-mono font-medium" data-testid="source-repository">
              {getSourceLabel(source)}
            </span>
            .
          </p>
        ) : (
          <p>
            <span className="font-mono font-medium" data-testid="source-repository">
              {getSourceLabel(source)}
            </span>
            : {en.s3.disconnectedBody}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canChangeKeys && (
            <Button asChild variant={isConnected ? "outline" : "default"} size="lg">
              <Link href={S3_SOURCE_PATH}>{en.s3.changeKeys}</Link>
            </Button>
          )}
          <form action={disconnectSourceAction}>
            <Button type="submit" variant="outline" size="lg">
              {en.source.disconnectAction}
            </Button>
          </form>
        </div>
        <p className="text-small text-muted-foreground">{en.s3.disconnectNote}</p>
      </CardContent>
    </Card>
  );
}

function DropboxConnectCard({ isConfigured }: { readonly isConfigured: boolean }) {
  return (
    <Card data-testid="dropbox-connect-card">
      <CardHeader>
        <CardTitle className="text-heading-3">{en.dropbox.cardTitle}</CardTitle>
      </CardHeader>
      {isConfigured ? (
        <>
          <CardContent className="text-body">
            <p>{en.dropbox.cardBody}</p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="lg">
              <Link href={DROPBOX_SOURCE_PATH}>{en.dropbox.cardAction}</Link>
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardContent className="text-body text-muted-foreground">
          <p data-testid="dropbox-unconfigured">{en.dropbox.unconfigured}</p>
        </CardContent>
      )}
    </Card>
  );
}

function DropboxSourceCard({ source, canRelink }: { readonly source: StoredDropboxSource; readonly canRelink: boolean }) {
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
      <CardContent className="grid gap-4 text-body" data-testid="source-card" data-status={source.status} data-kind="dropbox">
        {isConnected ? (
          <p>
            {en.dropbox.connectedBody}{" "}
            <span className="font-mono font-medium" data-testid="source-repository">
              {getSourceLabel(source)}
            </span>
            .
          </p>
        ) : (
          <p>
            <span className="font-mono font-medium" data-testid="source-repository">
              {getSourceLabel(source)}
            </span>
            : {en.dropbox.disconnectedBody}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canRelink && !isConnected && (
            <Button asChild size="lg">
              <Link href={DROPBOX_SOURCE_PATH}>{en.dropbox.relink}</Link>
            </Button>
          )}
          <form action={disconnectSourceAction}>
            <Button type="submit" variant="outline" size="lg">
              {en.source.disconnectAction}
            </Button>
          </form>
        </div>
        <p className="text-small text-muted-foreground">{en.dropbox.disconnectNote}</p>
      </CardContent>
    </Card>
  );
}

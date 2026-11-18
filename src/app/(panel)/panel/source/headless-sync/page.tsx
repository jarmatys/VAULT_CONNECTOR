// The sync form (VC-22): sign in to the sync service with the Obsidian account, then pick one of its vaults. A standard
// vault connects as it is; an end-to-end vault asks for its encryption password, which the browser turns into the key
// (`SyncVaultKeyForm`), so the password never reaches this server. The signed-in session waits in a sealed cookie for
// ten minutes; going back ends it at the service.
import { requireUser } from "@softure-ai/auth/next";
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Field, FieldDescription, FieldGroup, FieldLabel, Input, PageHeader } from "@softure-ai/theme-notion";
import { cookies } from "next/headers";
import Link from "next/link";
import { SyncVaultKeyForm } from "../../../../../components/panel/SyncVaultKeyForm.tsx";
import { en } from "../../../../../messages/en.ts";
import { listVaultsForLink, openPendingToken, readHeadlessSyncLinkError, type LinkableVault } from "../../../../../vault/sources/headless-sync/link.ts";
import { HEADLESS_SYNC_PENDING_COOKIE } from "../../../../../vault/sources/headless-sync/pending-cookie.ts";
import { getHeadlessSyncLinkContext } from "../../../../../vault/sources/headless-sync/request-context.ts";
import { HEADLESS_SYNC_SOURCE_PATH, SOURCE_PATH } from "../../../../../vault/sources/source-paths.ts";
import { connectSyncVaultAction, leaveSyncSignInAction, signInToSyncAction } from "./actions.ts";

export const dynamic = "force-dynamic";

interface HeadlessSyncSourcePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

type ErrorCode = keyof typeof en.headlessSync.errors;

export default async function HeadlessSyncSourcePage({ searchParams }: HeadlessSyncSourcePageProps) {
  const user = await requireUser({ next: HEADLESS_SYNC_SOURCE_PATH });
  const query = await searchParams;
  let error: ErrorCode | null = query.error === "vault.headless_rate_limited" ? "vault.headless_rate_limited" : readHeadlessSyncLinkError(query.error);
  const ctx = await getHeadlessSyncLinkContext();
  const token = ctx === null ? null : openPendingToken(ctx, user.id, (await cookies()).get(HEADLESS_SYNC_PENDING_COOKIE)?.value);
  let vaults: readonly LinkableVault[] | null = null;
  if (ctx !== null && token !== null) {
    const listed = await listVaultsForLink(ctx, token);
    if (listed.ok) vaults = listed.value;
    else error ??= listed.error;
  }

  return (
    <main className="grid gap-8">
      <PageHeader title={en.headlessSync.title} description={en.headlessSync.lead} crumbs={[{ label: en.source.title, href: SOURCE_PATH }]} />
      {error !== null && (
        <p role="alert" className="rounded-lg bg-red-bg px-4 py-3 text-body text-red" data-testid="sync-error">
          {en.headlessSync.errors[error]}
        </p>
      )}
      {ctx === null ? (
        <Card>
          <CardContent className="text-body text-muted-foreground">
            <p data-testid="sync-unconfigured">{en.headlessSync.unconfigured}</p>
          </CardContent>
        </Card>
      ) : vaults === null ? (
        <SignInCard />
      ) : (
        <VaultList vaults={vaults} />
      )}
    </main>
  );
}

function SignInCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-3">{en.headlessSync.signInTitle}</CardTitle>
      </CardHeader>
      <form action={signInToSyncAction} className="grid gap-6" data-testid="sync-sign-in-form">
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="sync-email">{en.headlessSync.email}</FieldLabel>
              <Input id="sync-email" name="email" type="email" required autoComplete="off" spellCheck={false} />
            </Field>
            <Field>
              <FieldLabel htmlFor="sync-password">{en.headlessSync.password}</FieldLabel>
              <Input id="sync-password" name="password" type="password" required autoComplete="off" />
            </Field>
            <Field>
              <FieldLabel htmlFor="sync-mfa">{en.headlessSync.mfaCode}</FieldLabel>
              <Input id="sync-mfa" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} />
              <FieldDescription>{en.headlessSync.mfaHint}</FieldDescription>
            </Field>
          </FieldGroup>
          <p className="mt-6 text-small text-muted-foreground">{en.headlessSync.signInNote}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="submit" size="lg">
            {en.headlessSync.signIn}
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={SOURCE_PATH}>{en.headlessSync.cancel}</Link>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function VaultList({ vaults }: { readonly vaults: readonly LinkableVault[] }) {
  return (
    <section className="grid gap-4" aria-labelledby="sync-pick-title">
      <div className="grid gap-1">
        <h2 id="sync-pick-title" className="text-heading-3">
          {en.headlessSync.pickTitle}
        </h2>
        <p className="text-body text-muted-foreground">{vaults.length === 0 ? en.headlessSync.noVaults : en.headlessSync.pickLead}</p>
      </div>
      {vaults.map((vault) => (
        <Card key={vault.id} data-testid="sync-vault" data-vault={vault.name}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-heading-3">
              <span>{vault.name}</span>
              <Badge variant="secondary">{vault.encryption === "e2ee" ? en.headlessSync.e2ee : en.headlessSync.standard}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-body">
            {!vault.isSupported ? (
              <p className="text-muted-foreground">{en.headlessSync.unsupported}</p>
            ) : vault.encryption === "e2ee" ? (
              <SyncVaultKeyForm action={connectSyncVaultAction} vaultId={vault.id} salt={vault.salt} />
            ) : (
              <form action={connectSyncVaultAction} className="grid gap-4">
                <input type="hidden" name="vaultId" value={vault.id} />
                <p className="text-muted-foreground">{en.headlessSync.standardBody}</p>
                <div>
                  <Button type="submit" size="lg">
                    {en.headlessSync.connect}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ))}
      <form action={leaveSyncSignInAction} className="flex flex-wrap gap-2">
        <Button type="submit" name="again" value="1" variant="outline" size="lg">
          {en.headlessSync.otherAccount}
        </Button>
        <Button type="submit" variant="ghost" size="lg">
          {en.headlessSync.cancel}
        </Button>
      </form>
    </section>
  );
}

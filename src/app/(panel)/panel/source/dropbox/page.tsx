// The Dropbox form (VC-21): the vault's folder in Dropbox, then Dropbox's own consent page for read-only access. When
// the account already reads a Dropbox folder, the form starts from it, so linking again renews the grant.
import { requireUser } from "@softure-ai/auth/next";
import { Button, Card, CardContent, CardFooter, Field, FieldDescription, FieldGroup, FieldLabel, Input, PageHeader } from "@softure-ai/theme-notion";
import Link from "next/link";
import { getRequestDatabase } from "../../../../../auth/module-context.ts";
import { en } from "../../../../../messages/en.ts";
import { readDropboxSourceSettings } from "../../../../../vault/settings.ts";
import { readDropboxLinkError } from "../../../../../vault/sources/dropbox/link.ts";
import { DROPBOX_SOURCE_PATH, SOURCE_PATH } from "../../../../../vault/sources/source-paths.ts";
import { findSource } from "../../../../../vault/sources/store.ts";
import { connectDropboxAction } from "./actions.ts";

export const dynamic = "force-dynamic";

interface DropboxSourcePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function DropboxSourcePage({ searchParams }: DropboxSourcePageProps) {
  const user = await requireUser({ next: DROPBOX_SOURCE_PATH });
  const error = readDropboxLinkError((await searchParams).error);
  const isConfigured = readDropboxSourceSettings(process.env).kind === "configured";
  const source = await findSource(await getRequestDatabase(), user.id);
  const folder = source?.kind === "dropbox" ? source.folder : "";
  return (
    <main className="grid gap-8">
      <PageHeader title={en.dropbox.title} description={en.dropbox.lead} crumbs={[{ label: en.source.title, href: SOURCE_PATH }]} />
      {error !== null && (
        <p role="alert" className="rounded-lg bg-red-bg px-4 py-3 text-body text-red" data-testid="dropbox-error">
          {en.dropbox.errors[error]}
        </p>
      )}
      {isConfigured ? (
        <Card>
          <form action={connectDropboxAction} className="grid gap-6">
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="dropbox-folder">{en.dropbox.folder}</FieldLabel>
                  <Input id="dropbox-folder" name="folder" autoComplete="off" spellCheck={false} defaultValue={folder} placeholder="/Obsidian/Vault" />
                  <FieldDescription>{en.dropbox.folderHint}</FieldDescription>
                </Field>
              </FieldGroup>
              <p className="mt-6 text-small text-muted-foreground">{en.dropbox.consentNote}</p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button type="submit" size="lg">
                {en.dropbox.submit}
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={SOURCE_PATH}>{en.dropbox.cancel}</Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-body text-muted-foreground">
            <p data-testid="dropbox-unconfigured">{en.dropbox.unconfigured}</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

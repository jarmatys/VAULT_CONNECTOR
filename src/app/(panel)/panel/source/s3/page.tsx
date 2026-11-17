// The S3 form (VC-20): endpoint, region, bucket, the vault's folder in it and a read-only key. When the account already
// reads a bucket, the form starts from its location, so changing the key is entering a new one.
import { requireUser } from "@softure-ai/auth/next";
import { Card, CardContent, PageHeader } from "@softure-ai/theme-notion";
import { getRequestDatabase } from "../../../../../auth/module-context.ts";
import { S3SourceForm } from "../../../../../components/panel/S3SourceForm.tsx";
import { en } from "../../../../../messages/en.ts";
import { readS3SourceSettings } from "../../../../../vault/settings.ts";
import { S3_SOURCE_PATH, SOURCE_PATH } from "../../../../../vault/sources/source-paths.ts";
import { findSource } from "../../../../../vault/sources/store.ts";
import { connectS3Action } from "./actions.ts";
import { INITIAL_S3_FORM_STATE, type S3FormState } from "./form-state.ts";

export const dynamic = "force-dynamic";

export default async function S3SourcePage() {
  const user = await requireUser({ next: S3_SOURCE_PATH });
  const isConfigured = readS3SourceSettings(process.env).kind === "configured";
  const source = await findSource(await getRequestDatabase(), user.id);
  const initial: S3FormState =
    source?.kind === "s3"
      ? { error: null, values: { endpoint: source.endpoint.replace(/\/$/, ""), region: source.region, bucket: source.bucket, prefix: source.prefix } }
      : INITIAL_S3_FORM_STATE;
  return (
    <main className="grid gap-8">
      <PageHeader title={en.s3.title} description={en.s3.lead} crumbs={[{ label: en.source.title, href: SOURCE_PATH }]} />
      {isConfigured ? (
        <S3SourceForm action={connectS3Action} initial={initial} cancelHref={SOURCE_PATH} />
      ) : (
        <Card>
          <CardContent className="text-body text-muted-foreground">
            <p data-testid="s3-unconfigured">{en.s3.unconfigured}</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

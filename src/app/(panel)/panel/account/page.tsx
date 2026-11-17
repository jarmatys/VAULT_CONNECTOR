// The account screen (VC-16): the account downloads what the service keeps about it (the privacy package's export
// route, every module's part) and deletes itself with its current password (the package's form and action: every
// module's rows, the vault's copies, the index and the assistants' tokens). A GitHub-only account learns how to set a
// password first. The frame is the Notion kit's; the form inside is the package's, themed through the sft bridge.
import { requireUser } from "@softure-ai/auth/next";
import { getAuthRoutes } from "@softure-ai/auth/server";
import { getSoftureConfig } from "@softure-ai/core/next";
import { deleteAccountAction, getPrivacyMessages } from "@softure-ai/privacy/next";
import { DeleteAccountForm } from "@softure-ai/privacy/ui";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, PageHeader } from "@softure-ai/theme-notion";
import Link from "next/link";
import { en } from "../../../../messages/en.ts";
import { ACCOUNT_PATH, PRIVACY_EXPORT_PATH } from "../../../../panel-paths.ts";

export const dynamic = "force-dynamic";

const copy = en.account;

export default async function AccountPage() {
  await requireUser({ next: ACCOUNT_PATH });
  const config = getSoftureConfig();
  const messages = getPrivacyMessages(config);
  return (
    <main className="grid gap-8">
      <PageHeader title={copy.title} description={copy.lead} />
      <Card data-testid="account-export">
        <CardHeader>
          <CardTitle className="text-heading-3">{messages.export.title}</CardTitle>
          <CardDescription>{messages.export.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-small text-muted-foreground">{copy.exportItems}</p>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" size="lg">
            <a href={PRIVACY_EXPORT_PATH} download>
              {messages.export.button}
            </a>
          </Button>
        </CardFooter>
      </Card>
      <Card data-testid="account-delete">
        <CardHeader>
          <CardTitle className="text-heading-3">{messages.delete.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <DeleteAccountForm action={deleteAccountAction} messages={messages} locale={config.locale} />
          <p className="text-small text-muted-foreground">
            {copy.githubPassword}{" "}
            <Link href={getAuthRoutes(config).forgotPassword} className="text-foreground underline underline-offset-2">
              {copy.forgotPassword}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

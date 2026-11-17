// "Connect Claude" (VC-9): the connector URL to paste into Claude, the account's sentence about its vault (sent in the
// MCP server's instructions) and mcp-access's list of connected apps and tokens, where each is revoked at once.
import { requireUser } from "@softure-ai/auth/next";
import { formatMessage } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestOrigins, getTokenManagerProps, issueTokenAction, revokeGrantAction, revokeTokenAction } from "@softure-ai/mcp-access/next";
import { TokenManager } from "@softure-ai/mcp-access/ui";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CodeBlock,
  Label,
  PageHeader,
  Textarea,
} from "@softure-ai/theme-notion";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { en } from "../../../../messages/en.ts";
import { DESCRIPTION_FIELD, readConnectorsError } from "../../../../mcp/connector-paths.ts";
import { getVaultDescription, MAX_VAULT_DESCRIPTION_LENGTH } from "../../../../mcp/profile/vault-description.ts";
import { CONNECTORS_PATH } from "../../../../panel-paths.ts";
import { saveVaultDescriptionAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const copy = en.connectors;

interface ConnectorsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function ConnectorsPage({ searchParams }: ConnectorsPageProps) {
  const user = await requireUser({ next: CONNECTORS_PATH });
  const query = await searchParams;
  const error = readConnectorsError(query.error);
  const isSaved = query.saved === "1" && error === null;
  const config = getSoftureConfig();
  const [{ appOrigin }, description, tokens] = await Promise.all([
    getRequestOrigins(config, CONNECTORS_PATH),
    getRequestDatabase().then((db) => getVaultDescription(db, user.id)),
    getTokenManagerProps({ userId: user.id, config }),
  ]);

  return (
    <main className="grid gap-8">
      <PageHeader title={copy.title} description={copy.lead} />
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-3">{copy.urlTitle}</CardTitle>
          <CardDescription>{copy.urlBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock data-testid="connector-url">{`${appOrigin}/api/mcp`}</CodeBlock>
        </CardContent>
      </Card>
      <Card>
        <form action={saveVaultDescriptionAction} className="grid gap-6" data-testid="description-form">
          <CardHeader>
            <CardTitle className="text-heading-3">{copy.descriptionTitle}</CardTitle>
            <CardDescription>{copy.descriptionBody}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor={DESCRIPTION_FIELD}>{copy.descriptionLabel}</Label>
            <Textarea id={DESCRIPTION_FIELD} name={DESCRIPTION_FIELD} defaultValue={description} rows={3} />
            {error !== null && (
              <p role="alert" className="text-small text-red" data-testid="description-error">
                {formatMessage(copy.descriptionTooLong, { max: MAX_VAULT_DESCRIPTION_LENGTH })}
              </p>
            )}
            {isSaved && (
              <p role="status" className="text-small text-green" data-testid="description-saved">
                {copy.descriptionSaved}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" size="lg">
              {copy.descriptionSave}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-3">{copy.accessTitle}</CardTitle>
          <CardDescription>{copy.accessBody}</CardDescription>
        </CardHeader>
        <CardContent data-testid="connector-access">
          <TokenManager
            {...tokens}
            sections={["grants", "tokens", "issue"]}
            issueAction={issueTokenAction}
            revokeAction={revokeTokenAction}
            {...(tokens.grants === undefined ? {} : { revokeGrantAction })}
          />
        </CardContent>
      </Card>
    </main>
  );
}

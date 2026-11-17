// The panel of a new account: the guided setup and nothing else to configure (FR-5, VC-12). It reads where the account
// stands (load-onboarding.ts), turns that into the five steps (onboarding-steps.ts) and shows them with a card for each
// open step: the source, the folders, the index filling, the connector URL to paste into Claude with the optional
// sentence about the vault, and the first question. While the index is being built the page reads itself again.
import { requireUser } from "@softure-ai/auth/next";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestOrigins } from "@softure-ai/mcp-access/next";
import { PageHeader } from "@softure-ai/theme-notion";
import { getModuleContext, getRequestDatabase } from "../../../auth/module-context.ts";
import { Onboarding, type DescriptionNotice } from "../../../components/panel/Onboarding.tsx";
import { PanelRefresher } from "../../../components/panel/PanelRefresher.tsx";
import { readConnectorsError } from "../../../mcp/connector-paths.ts";
import { getVaultDescription } from "../../../mcp/profile/vault-description.ts";
import { en } from "../../../messages/en.ts";
import { loadOnboarding } from "../../../onboarding/load-onboarding.ts";
import { getOnboarding } from "../../../onboarding/onboarding-steps.ts";
import { PANEL_PATH } from "../../../panel-paths.ts";
import { readEmbeddingSettings } from "../../../vault/index/embedding-settings.ts";
import { KEYWORD_ONLY_MODEL } from "../../../vault/index/index-step.ts";
import { findSource, getSourceLabel } from "../../../vault/sources/store.ts";
import { readVaultStorageSettings } from "../../../vault/storage/storage-settings.ts";
import { saveOnboardingDescriptionAction } from "./actions.ts";

export const dynamic = "force-dynamic";

interface PanelPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function PanelPage({ searchParams }: PanelPageProps) {
  const user = await requireUser({ next: PANEL_PATH });
  const query = await searchParams;
  const settings = readEmbeddingSettings(process.env);
  const model = settings.kind === "none" ? KEYWORD_ONLY_MODEL : settings.model;
  const [ctx, db, { appOrigin }] = await Promise.all([getModuleContext(), getRequestDatabase(), getRequestOrigins(getSoftureConfig(), PANEL_PATH)]);
  const [loaded, source, description] = await Promise.all([
    loadOnboarding({ ...ctx, db }, { userId: user.id, model }),
    findSource(db, user.id),
    getVaultDescription(db, user.id),
  ]);
  const onboarding = getOnboarding(loaded.facts);
  // An instance without a note store never copies, so there is nothing to wait for (the status screen says why).
  const isRefreshing = onboarding.isWaiting && readVaultStorageSettings(process.env).kind === "configured";
  return (
    <main className="grid gap-8">
      <PageHeader title={en.panel.title} description={en.onboarding.lead} />
      {isRefreshing && <PanelRefresher />}
      <Onboarding
        onboarding={onboarding}
        sourceLabel={source === null ? null : getSourceLabel(source)}
        sharedFolders={loaded.facts.sharedFolders}
        notes={loaded.facts.notes}
        indexed={loaded.facts.indexed}
        connectorUrl={`${appOrigin}/api/mcp`}
        description={description}
        descriptionNotice={toDescriptionNotice(query)}
        descriptionAction={saveOnboardingDescriptionAction}
      />
    </main>
  );
}

function toDescriptionNotice(query: Readonly<Record<string, string | string[] | undefined>>): DescriptionNotice {
  if (readConnectorsError(query.error) !== null) return "too_long";
  return query.saved === "1" ? "saved" : "none";
}

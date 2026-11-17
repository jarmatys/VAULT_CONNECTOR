// The account's status (VC-10): how far the shared notes are copied (the latest sync run) and made searchable (notes
// indexed against this instance's model, passages, the last failure in plain words). Read-only; it updates as the
// background jobs run.
import { requireUser } from "@softure-ai/auth/next";
import { PageHeader } from "@softure-ai/theme-notion";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { VaultStatus } from "../../../../components/panel/VaultStatus.tsx";
import { en } from "../../../../messages/en.ts";
import { STATUS_PATH } from "../../../../panel-paths.ts";
import { readEmbeddingSettings } from "../../../../vault/index/embedding-settings.ts";
import { getIndexProgress } from "../../../../vault/index/index-store.ts";
import { KEYWORD_ONLY_MODEL } from "../../../../vault/index/index-step.ts";
import { findLatestRun } from "../../../../vault/sync/sync-store.ts";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const user = await requireUser({ next: STATUS_PATH });
  const db = await getRequestDatabase();
  const settings = readEmbeddingSettings(process.env);
  const model = settings.kind === "none" ? KEYWORD_ONLY_MODEL : settings.model;
  const [latestRun, progress] = await Promise.all([findLatestRun(db, user.id), getIndexProgress(db, { userId: user.id, model })]);
  return (
    <main className="grid gap-8">
      <PageHeader title={en.status.title} description={en.status.lead} />
      <VaultStatus latestRun={latestRun} progress={progress} searchByMeaning={settings.kind !== "none"} />
    </main>
  );
}

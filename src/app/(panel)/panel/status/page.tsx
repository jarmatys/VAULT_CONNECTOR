// The account's status (VC-10): how far the shared notes are copied (the latest sync run) and made searchable (notes
// indexed against this instance's model, passages, the last failure in plain words). Read-only; it updates as the
// background jobs run. Above them, the plan's limits against the account's use (VC-14).
import { requireUser } from "@softure-ai/auth/next";
import { PageHeader } from "@softure-ai/theme-notion";
import { systemClock } from "@softure-ai/core";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getRequestDatabase } from "../../../../auth/module-context.ts";
import { VaultStatus } from "../../../../components/panel/VaultStatus.tsx";
import { en } from "../../../../messages/en.ts";
import { STATUS_PATH } from "../../../../panel-paths.ts";
import { readEmbeddingSettings } from "../../../../vault/index/embedding-settings.ts";
import { getIndexProgress } from "../../../../vault/index/index-store.ts";
import { KEYWORD_ONLY_MODEL } from "../../../../vault/index/index-step.ts";
import { getPlanUsage } from "../../../../vault/limits/plan-usage.ts";
import { findLatestRun } from "../../../../vault/sync/sync-store.ts";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const user = await requireUser({ next: STATUS_PATH });
  const db = await getRequestDatabase();
  const ctx = { db, clock: systemClock, config: getSoftureConfig() };
  const settings = readEmbeddingSettings(process.env);
  const model = settings.kind === "none" ? KEYWORD_ONLY_MODEL : settings.model;
  const [plan, latestRun, progress] = await Promise.all([
    getPlanUsage(ctx, user.id),
    findLatestRun(db, user.id),
    getIndexProgress(db, { userId: user.id, model }),
  ]);
  return (
    <main className="grid gap-8">
      <PageHeader title={en.status.title} description={en.status.lead} />
      <VaultStatus plan={plan} latestRun={latestRun} progress={progress} searchByMeaning={settings.kind !== "none"} />
    </main>
  );
}

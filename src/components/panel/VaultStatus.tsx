// The status screen's cards: the account's plan against its use (notes, storage, searches this month, the notes left
// out over the limit), the copy of the shared notes (the latest sync run) and the search index (notes indexed against
// the current model, passages, the last failure in plain words). Rendered on the server from plain data, so the page
// reads the database and these cards only show it.
import { Card, CardContent, CardHeader, CardTitle, DetailTable, MiniProgress, Status, type DetailRow } from "@softure-ai/theme-notion";
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, LoaderCircleIcon } from "lucide-react";
import { formatMessage } from "@softure-ai/core";
import { en } from "../../messages/en.ts";
import { toMebibytes } from "../../vault/limits/account-limits.ts";
import type { PlanUsage } from "../../vault/limits/plan-usage.ts";
import type { IndexProgress } from "../../vault/index/index-store.ts";
import type { SyncRun } from "../../vault/sync/sync-store.ts";

export type SyncSummary = Pick<SyncRun, "status" | "errorCode" | "startedAt" | "finishedAt" | "copied" | "plannedCopies" | "skippedOverLimit">;

export interface VaultStatusProps {
  /** Null for an account billing does not know: no plan card. */
  readonly plan: PlanUsage | null;
  readonly latestRun: SyncSummary | null;
  readonly progress: IndexProgress;
  /** True when the instance has an embedding model. */
  readonly searchByMeaning: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** A date as the panel shows it, in UTC so every reader sees the same moment. */
export function formatStatusDate(date: Date): string {
  return `${DATE_FORMAT.format(date)} UTC`;
}

/** A stored error code in plain words; an unknown code gets a general sentence. */
export function describeStatusError(code: string): string {
  const errors: Readonly<Record<string, string>> = en.status.errors;
  return errors[code] ?? en.status.unknownError;
}

export function VaultStatus({ plan, latestRun, progress, searchByMeaning }: VaultStatusProps) {
  return (
    <div className="grid gap-4">
      {plan !== null && <PlanCard plan={plan} skippedOverLimit={latestRun?.skippedOverLimit ?? 0} />}
      <SyncCard run={latestRun} />
      <IndexCard progress={progress} searchByMeaning={searchByMeaning} />
    </div>
  );
}

interface Meter {
  readonly key: string;
  readonly label: string;
  readonly used: number;
  readonly limit: number | null;
  readonly text: string;
}

function PlanCard({ plan, skippedOverLimit }: { readonly plan: PlanUsage; readonly skippedOverLimit: number }) {
  const { limits, totals, searches } = plan;
  const storageUsed = toMebibytes(totals.bytes);
  const meters: Meter[] = [
    { key: "notes", label: en.status.planNotes, used: totals.notes, limit: limits.notes, text: usageText(totals.notes, limits.notes) },
    {
      key: "storage",
      label: en.status.planStorage,
      used: storageUsed,
      limit: limits.storageMb,
      text:
        limits.storageMb === null
          ? `${formatMessage(en.status.storageUnlimited, { used: storageUsed })} (${en.status.unlimited})`
          : formatMessage(en.status.storageOf, { used: storageUsed, limit: limits.storageMb }),
    },
    { key: "searches", label: en.status.planSearches, used: searches.used, limit: searches.limit, text: usageText(searches.used, searches.limit) },
  ];
  const rows: DetailRow[] = [{ key: "resets", label: en.status.planResets, value: formatStatusDate(searches.resetsAt) }];
  return (
    <Card data-testid="status-plan">
      <CardHeader>
        <CardTitle className="text-heading-3">{en.status.planTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-body">
        <Status color={skippedOverLimit > 0 ? "orange" : "gray"} icon={skippedOverLimit > 0 ? CircleAlertIcon : CircleDashedIcon}>
          {plan.planName}
        </Status>
        <p className="text-small text-muted-foreground">{en.status.planLead}</p>
        {skippedOverLimit > 0 && <p data-testid="status-over-limit">{formatMessage(en.status.overLimit, { count: skippedOverLimit })}</p>}
        {meters.map((meter) => (
          <div className="grid gap-1" key={meter.key} data-testid={`status-plan-${meter.key}`}>
            <span className="text-small text-muted-foreground">{meter.label}</span>
            {meter.limit === null ? (
              <span>{meter.text}</span>
            ) : (
              <MiniProgress aria-label={meter.label} value={toPercent(meter.used, meter.limit)} label={meter.text} tone={toneOf(meter.used, meter.limit)} />
            )}
          </div>
        ))}
        <DetailTable label={en.status.detailsLabel} rows={rows} />
      </CardContent>
    </Card>
  );
}

function usageText(used: number, limit: number | null): string {
  if (limit === null) return `${String(used)} (${en.status.unlimited})`;
  return formatMessage(en.status.usageOf, { used, limit });
}

/** Share of the limit used, 0 to 100; a limit of 0 reads as full. */
function toPercent(used: number, limit: number): number {
  if (limit === 0) return 100;
  return Math.min(100, (used / limit) * 100);
}

/** Danger when the limit is reached, a warning from 80 %, otherwise the default fill. */
function toneOf(used: number, limit: number): "default" | "warning" | "danger" {
  if (used >= limit) return "danger";
  return used >= limit * 0.8 ? "warning" : "default";
}

function SyncCard({ run }: { readonly run: SyncSummary | null }) {
  const rows: DetailRow[] =
    run === null
      ? []
      : [
          { key: "last-sync", label: en.status.lastSync, value: formatStatusDate(run.finishedAt ?? run.startedAt) },
          { key: "copied", label: en.status.copied, value: run.plannedCopies === 0 ? "" : `${String(run.copied)} / ${String(run.plannedCopies)}` },
        ];
  return (
    <Card data-testid="status-sync">
      <CardHeader>
        <CardTitle className="text-heading-3">{en.status.syncTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-body">
        {run === null && (
          <Status color="gray" icon={CircleDashedIcon}>
            {en.status.syncNever}
          </Status>
        )}
        {run?.status === "running" && (
          <Status color="blue" icon={LoaderCircleIcon}>
            {en.status.syncRunning}
          </Status>
        )}
        {run?.status === "succeeded" && (
          <Status color="green" icon={CircleCheckIcon}>
            {en.status.syncSucceeded}
          </Status>
        )}
        {run?.status === "failed" && (
          <>
            <Status color="red" icon={CircleAlertIcon}>
              {en.status.syncFailed}
            </Status>
            <p data-testid="status-sync-error">{describeStatusError(run.errorCode ?? "")}</p>
          </>
        )}
        <DetailTable label={en.status.detailsLabel} rows={rows} />
      </CardContent>
    </Card>
  );
}

function IndexCard({ progress, searchByMeaning }: { readonly progress: IndexProgress; readonly searchByMeaning: boolean }) {
  const percent = progress.notes === 0 ? 0 : (progress.indexed / progress.notes) * 100;
  const isDone = progress.notes > 0 && progress.indexed === progress.notes;
  const rows: DetailRow[] = [
    { key: "notes", label: en.status.notes, value: String(progress.notes) },
    { key: "passages", label: en.status.passages, value: String(progress.passages) },
    { key: "last-indexed", label: en.status.lastIndexed, value: progress.lastIndexedAt === null ? "" : formatStatusDate(progress.lastIndexedAt) },
  ];
  return (
    <Card data-testid="status-index">
      <CardHeader>
        <CardTitle className="text-heading-3">{en.status.indexTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-body">
        {progress.failure !== null ? (
          <>
            <Status color="orange" icon={CircleAlertIcon}>
              {en.status.indexFailed}
            </Status>
            <p data-testid="status-index-error">
              {describeStatusError(progress.failure.errorCode)} {en.status.retrying} ({formatStatusDate(progress.failure.failedAt)})
            </p>
          </>
        ) : progress.notes === 0 ? (
          <Status color="gray" icon={CircleDashedIcon}>
            {en.status.indexEmpty}
          </Status>
        ) : isDone ? (
          <Status color="green" icon={CircleCheckIcon}>
            {en.status.indexDone}
          </Status>
        ) : (
          <Status color="blue" icon={LoaderCircleIcon}>
            {en.status.indexRunning}
          </Status>
        )}
        {progress.notes > 0 && (
          <div className="grid gap-1">
            <span className="text-small text-muted-foreground">{en.status.progressLabel}</span>
            <MiniProgress
              aria-label={en.status.progressLabel}
              value={percent}
              label={`${String(progress.indexed)} / ${String(progress.notes)}`}
              tone={isDone ? "success" : "default"}
            />
          </div>
        )}
        <p className="text-small text-muted-foreground" data-testid="status-mode">
          {searchByMeaning ? en.status.byMeaning : en.status.byWords}
        </p>
        <DetailTable label={en.status.detailsLabel} rows={rows} />
      </CardContent>
    </Card>
  );
}

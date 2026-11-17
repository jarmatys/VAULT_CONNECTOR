// The status screen's two cards: the copy of the shared notes (the latest sync run) and the search index (notes
// indexed against the current model, passages, the last failure in plain words). Rendered on the server from plain
// data, so the page reads the database and these cards only show it.
import { Card, CardContent, CardHeader, CardTitle, DetailTable, MiniProgress, Status, type DetailRow } from "@softure-ai/theme-notion";
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, LoaderCircleIcon } from "lucide-react";
import { en } from "../../messages/en.ts";
import type { IndexProgress } from "../../vault/index/index-store.ts";
import type { SyncRun } from "../../vault/sync/sync-store.ts";

export type SyncSummary = Pick<SyncRun, "status" | "errorCode" | "startedAt" | "finishedAt" | "copied" | "plannedCopies">;

export interface VaultStatusProps {
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

export function VaultStatus({ latestRun, progress, searchByMeaning }: VaultStatusProps) {
  return (
    <div className="grid gap-4">
      <SyncCard run={latestRun} />
      <IndexCard progress={progress} searchByMeaning={searchByMeaning} />
    </div>
  );
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

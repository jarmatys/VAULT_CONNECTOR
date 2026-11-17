// The funnel per day for the operator (FR-3). The analytics module reports a window of days as one total per step;
// consecutive windows (today, the last two days, ...) differ by exactly one day, so their differences are the days.
import { getFunnelReport, MAX_REPORT_DAYS, type AnalyticsContext, type FunnelReport } from "@softure-ai/analytics/server";

/** One calendar day of the funnel, in the app's time zone. */
export interface FunnelDay {
  /** `YYYY-MM-DD`. */
  readonly day: string;
  /** Each step's count that day, in funnel order. */
  readonly counts: Readonly<Record<string, number>>;
}

/**
 * Turns the reports of the last 1, 2, ... n days (in that order, all read at one moment) into n days, oldest first.
 * Throws when a window does not start one day before the previous one: the reports were read across midnight.
 */
export function splitFunnelDays(windows: readonly FunnelReport[]): FunnelDay[] {
  const days = windows.map((window, index) => {
    const previous = index === 0 ? undefined : windows[index - 1];
    if (previous !== undefined && (window.to !== previous.to || window.from >= previous.from)) {
      throw new Error(`splitFunnelDays: window ${String(index + 1)} (${window.from}..${window.to}) does not extend window ${String(index)}`);
    }
    const counts: Record<string, number> = {};
    for (const step of window.steps) counts[step] = (window.total[step] ?? 0) - (previous?.total[step] ?? 0);
    return { day: window.from, counts };
  });
  return days.reverse();
}

/** The last `days` days of the funnel (today included), oldest first. */
export async function getFunnelDays(ctx: AnalyticsContext, days: number): Promise<FunnelDay[]> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_REPORT_DAYS) {
    throw new RangeError(`getFunnelDays: days must be a whole number from 1 to ${String(MAX_REPORT_DAYS)}, got ${String(days)}`);
  }
  const windows: FunnelReport[] = [];
  for (let window = 1; window <= days; window += 1) windows.push(await getFunnelReport(ctx, { days: window }));
  return splitFunnelDays(windows);
}

/** The days as a plain-text table: one row per day, one column per step. */
export function formatFunnelDays(steps: readonly string[], days: readonly FunnelDay[]): string {
  const header = ["day", ...steps];
  const rows = days.map((day) => [day.day, ...steps.map((step) => String(day.counts[step] ?? 0))]);
  const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map((row) => row[column]?.length ?? 0)));
  return [header, ...rows].map((row) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd()).join("\n");
}

// The measurements of the PRD's goals (VC-23): what each one is, its target, and how a run's records become the one
// table of measured values against the targets. Every measuring job writes its records as a JSON file into one folder
// (`MEASURE_OUT`, default `measure-results/`); `report.ts` reads the folder and renders the table.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** The goals the run measures (context/foundation/prd.md). */
export const GOALS = {
  "G-2": "Sign-up to the first answer",
  "G-3": "Directory checklist",
  "G-5": "Self-hosted with one compose file",
  "NFR-1": "Tool speed on 5,000 notes",
  "NFR-2": "Isolation between accounts and folders",
  "NFR-5": "A source change reaches the tools",
} as const;

export type GoalId = keyof typeof GOALS;
export type Unit = "ms" | "min" | "count";

/** A target: the measured value must stay at or below `max`, or reach at least `min`. */
export type Target = { readonly kind: "max"; readonly value: number } | { readonly kind: "min"; readonly value: number };

export interface MeasureDefinition {
  readonly goal: GoalId;
  readonly name: string;
  readonly unit: Unit;
  readonly target: Target;
}

/** Every measurement of the run, in the order of the table. */
export const MEASURES = {
  "onboarding-node": { goal: "G-2", name: "Sign-up to first answer, Node", unit: "ms", target: { kind: "max", value: 120_000 } },
  "onboarding-workers": { goal: "G-2", name: "Sign-up to first answer, Workers (workerd)", unit: "ms", target: { kind: "max", value: 120_000 } },
  "checklist-points": { goal: "G-3", name: "Checklist points met, with evidence", unit: "count", target: { kind: "min", value: 7 } },
  "compose-up": { goal: "G-5", name: "`docker compose up` to a healthy stack", unit: "ms", target: { kind: "max", value: 300_000 } },
  "onboarding-compose": { goal: "G-5", name: "Sign-up to first answer on the compose stack", unit: "ms", target: { kind: "max", value: 120_000 } },
  "search-p95": { goal: "NFR-1", name: "`search_vault` p95", unit: "ms", target: { kind: "max", value: 3_000 } },
  "index-p95": { goal: "NFR-1", name: "`vault_index` p95", unit: "ms", target: { kind: "max", value: 1_000 } },
  "read-p95": { goal: "NFR-1", name: "`get_note` p95", unit: "ms", target: { kind: "max", value: 1_000 } },
  "isolation-leaks": { goal: "NFR-2", name: "Answers with another account's or an unpicked folder's text", unit: "count", target: { kind: "max", value: 0 } },
  "sync-delay-schedule": { goal: "NFR-5", name: "Change visible to the tools, no push (worst case)", unit: "min", target: { kind: "max", value: 10 } },
  "sync-delay-push": { goal: "NFR-5", name: "Change visible to the tools after a push", unit: "min", target: { kind: "max", value: 10 } },
} as const satisfies Record<string, MeasureDefinition>;

export type MeasureId = keyof typeof MEASURES;

const MEASURE_IDS = Object.keys(MEASURES) as [MeasureId, ...MeasureId[]];

const recordSchema = z.object({
  id: z.enum(MEASURE_IDS),
  value: z.number().finite().nonnegative(),
  /** Where it was measured: host, database, model, data set. */
  where: z.string().min(1).max(300),
  /** How many samples or calls stand behind the value, and anything a reader needs to read it. */
  detail: z.string().max(300).optional(),
});

export type MeasureRecord = z.infer<typeof recordSchema>;

/** The folder the records go to. */
export function getMeasureDir(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const dir = env.MEASURE_OUT;
  return dir === undefined || dir === "" ? "measure-results" : dir;
}

/** Writes one job's records as `<name>.json` in the folder. */
export function writeMeasureRecords(dir: string, name: string, records: readonly MeasureRecord[]): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(records.map((record) => recordSchema.parse(record)), null, 2)}\n`);
  return path;
}

/** Reads every `*.json` file of the folder; a malformed file fails with its name. */
export function readMeasureRecords(dir: string): MeasureRecord[] {
  const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  return files.flatMap((file) => {
    const parsed = z.array(recordSchema).safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown);
    if (!parsed.success) throw new Error(`Reading the measurements in ${file}: ${parsed.error.message}`);
    return parsed.data;
  });
}

/** True when the value meets its target. */
export function meetsTarget(target: Target, value: number): boolean {
  return target.kind === "max" ? value <= target.value : value >= target.value;
}

/** A value in the unit people read it in: seconds above a second, whole minutes and counts. */
export function formatValue(unit: Unit, value: number): string {
  if (unit === "count") return String(Math.round(value));
  if (unit === "min") return `${value.toFixed(1)} min`;
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)} s` : `${String(Math.round(value))} ms`;
}

export function formatTarget(unit: Unit, target: Target): string {
  const sign = target.kind === "max" ? "≤" : "≥";
  return `${sign} ${formatValue(unit, target.value)}`;
}

export interface MeasureReport {
  readonly markdown: string;
  /** Measures with no record in the run. */
  readonly missing: readonly MeasureId[];
  /** Measures whose value misses the target. */
  readonly missed: readonly MeasureId[];
}

/** The table of the run: one row per measure, in the order of MEASURES; a measure recorded twice keeps its worst value. */
export function renderMeasureReport(records: readonly MeasureRecord[], heading: { readonly title: string; readonly run?: string }): MeasureReport {
  const byId = new Map<MeasureId, MeasureRecord>();
  for (const record of records) {
    const known = byId.get(record.id);
    const target = MEASURES[record.id].target;
    const isWorse = known === undefined || (target.kind === "max" ? record.value > known.value : record.value < known.value);
    if (isWorse) byId.set(record.id, record);
  }
  const missing: MeasureId[] = [];
  const missed: MeasureId[] = [];
  const rows = MEASURE_IDS.map((id) => {
    const measure: MeasureDefinition = MEASURES[id];
    const record = byId.get(id);
    if (record === undefined) {
      missing.push(id);
      return `| ${measure.goal} | ${measure.name} | ${formatTarget(measure.unit, measure.target)} | not measured | — | — |`;
    }
    const isMet = meetsTarget(measure.target, record.value);
    if (!isMet) missed.push(id);
    const where = record.detail === undefined ? record.where : `${record.where}; ${record.detail}`;
    return `| ${measure.goal} | ${measure.name} | ${formatTarget(measure.unit, measure.target)} | ${formatValue(measure.unit, record.value)} | ${escapeCell(where)} | ${isMet ? "met" : "**missed**"} |`;
  });
  const lines = [
    `## ${heading.title}`,
    "",
    ...(heading.run === undefined ? [] : [`Run: ${heading.run}`, ""]),
    "| Goal | Measure | Target | Measured | Where | Result |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Met: ${String(MEASURE_IDS.length - missing.length - missed.length)} of ${String(MEASURE_IDS.length)}` +
      (missed.length === 0 ? "" : `; missed: ${missed.join(", ")}`) +
      (missing.length === 0 ? "" : `; not measured: ${missing.join(", ")}`) +
      ".",
  ];
  return { markdown: `${lines.join("\n")}\n`, missing, missed };
}

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** The p95 of a sample, nearest rank; Infinity for an empty sample. */
export function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) return Infinity;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Infinity;
}

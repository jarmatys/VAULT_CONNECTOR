// Writes one measurement record from a CI job, for `report.ts` to read with the others:
//   node scripts/measure/record.ts --id=onboarding-node --where="…" --from-playwright=report.json
//   node scripts/measure/record.ts --id=compose-up --where="…" --value=87000
// The folder is MEASURE_OUT (default measure-results/); the file is named after the measure.
import { readFileSync } from "node:fs";
import { getMeasureDir, MEASURES, writeMeasureRecords, type MeasureId } from "./measurements.ts";
import { readAnnotationValues } from "./playwright-report.ts";

const USAGE = "usage: node scripts/measure/record.ts --id=<measure> --where=<text> (--value=<number> | --from-playwright=<report.json>) [--detail=<text>]";
/** The annotation the onboarding test records its time in. */
const ONBOARDING_ANNOTATION = "onboarding-ms";

function readFlags(argv: readonly string[]): Map<string, string> | null {
  const flags = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/s.exec(argument);
    if (match === null) return null;
    flags.set(match[1] ?? "", match[2] ?? "");
  }
  return flags;
}

function isMeasureId(value: string): value is MeasureId {
  return Object.hasOwn(MEASURES, value);
}

function main(): number {
  const flags = readFlags(process.argv.slice(2));
  const id = flags?.get("id") ?? "";
  const where = flags?.get("where") ?? "";
  if (flags === null || !isMeasureId(id) || where === "") {
    console.error(USAGE);
    return 2;
  }
  const report = flags.get("from-playwright");
  let value: number;
  let detail = flags.get("detail");
  if (report !== undefined) {
    const read = readAnnotationValues(JSON.parse(readFileSync(report, "utf8")) as unknown, ONBOARDING_ANNOTATION);
    if (!read.ok) {
      console.error(`record ${id}: ${read.error} (${report})`);
      return 1;
    }
    value = Math.max(...read.values);
    detail ??= `${String(read.values.length)} timed run(s), the slowest kept`;
  } else {
    value = Number(flags.get("value"));
    if (!Number.isFinite(value) || value < 0) {
      console.error(USAGE);
      return 2;
    }
  }
  const path = writeMeasureRecords(getMeasureDir(), id, [{ id, value, where, ...(detail === undefined ? {} : { detail }) }]);
  console.log(`record ${id}: ${String(value)} → ${path}`);
  return 0;
}

process.exitCode = main();

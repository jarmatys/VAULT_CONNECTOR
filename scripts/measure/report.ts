// Renders the run's table from the records in the folder: `node scripts/measure/report.ts [<dir>] [--run=<url>]`.
// Prints the markdown (the measure workflow appends it to the job summary). Exit 1 when a measure misses its target
// or has no record, so a gap is red, not a quiet line.
import { getMeasureDir, readMeasureRecords, renderMeasureReport } from "./measurements.ts";

function main(): number {
  const args = process.argv.slice(2);
  const run = args.find((arg) => arg.startsWith("--run="))?.slice("--run=".length);
  const dir = args.find((arg) => !arg.startsWith("--")) ?? getMeasureDir();
  const report = renderMeasureReport(readMeasureRecords(dir), { title: "Measured goals", ...(run === undefined ? {} : { run }) });
  console.log(report.markdown);
  return report.missed.length === 0 && report.missing.length === 0 ? 0 : 1;
}

process.exitCode = main();

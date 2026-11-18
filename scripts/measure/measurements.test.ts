import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatTarget, formatValue, MEASURES, meetsTarget, percentile95, readMeasureRecords, renderMeasureReport, writeMeasureRecords, type MeasureRecord } from "./measurements.ts";
import { readAnnotationValues } from "./playwright-report.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-measure-"));
  dirs.push(dir);
  return dir;
}

/** A record for every measure, each at its target. */
function allAtTarget(): MeasureRecord[] {
  return Object.entries(MEASURES).map(([id, measure]) => ({ id: id as MeasureRecord["id"], value: measure.target.value, where: "PGlite" }));
}

describe("targets", () => {
  it("meets a maximum at and below it, a minimum at and above it", () => {
    expect(meetsTarget({ kind: "max", value: 10 }, 10)).toBe(true);
    expect(meetsTarget({ kind: "max", value: 10 }, 10.01)).toBe(false);
    expect(meetsTarget({ kind: "min", value: 7 }, 7)).toBe(true);
    expect(meetsTarget({ kind: "min", value: 7 }, 6)).toBe(false);
  });

  it("formats milliseconds, seconds, minutes and counts", () => {
    expect(formatValue("ms", 412.4)).toBe("412 ms");
    expect(formatValue("ms", 41_234)).toBe("41.2 s");
    expect(formatValue("min", 5.04)).toBe("5.0 min");
    expect(formatValue("count", 0)).toBe("0");
    expect(formatTarget("ms", { kind: "max", value: 120_000 })).toBe("≤ 120.0 s");
    expect(formatTarget("count", { kind: "min", value: 7 })).toBe("≥ 7");
  });

  it("takes the nearest-rank p95 and gives Infinity for no sample", () => {
    expect(percentile95(Array.from({ length: 20 }, (_, index) => index + 1))).toBe(19);
    expect(percentile95([5])).toBe(5);
    expect(percentile95([])).toBe(Infinity);
  });
});

describe("the run's table", () => {
  it("renders one row per measure in order, all met", () => {
    const report = renderMeasureReport(allAtTarget(), { title: "Measured goals", run: "https://example.test/run/1" });
    expect(report.missed).toEqual([]);
    expect(report.missing).toEqual([]);
    const rows = report.markdown.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Goal") && !line.startsWith("| ---"));
    expect(rows).toHaveLength(Object.keys(MEASURES).length);
    expect(rows[0]).toBe("| G-2 | Sign-up to first answer, Node | ≤ 120.0 s | 120.0 s | PGlite | met |");
    expect(report.markdown).toContain("Run: https://example.test/run/1");
    expect(report.markdown).toContain(`Met: ${String(rows.length)} of ${String(rows.length)}.`);
  });

  it("marks a missed target, keeps the worst of two records and lists measures with no record", () => {
    const records = allAtTarget().filter((record) => record.id !== "compose-up");
    records.push({ id: "search-p95", value: 3_200, where: "PGlite", detail: "40 calls | slow" });
    records.push({ id: "checklist-points", value: 6, where: "repo" });
    const report = renderMeasureReport(records, { title: "Measured goals" });
    expect(report.missed).toEqual(["checklist-points", "search-p95"]);
    expect(report.missing).toEqual(["compose-up"]);
    expect(report.markdown).toContain("| NFR-1 | `search_vault` p95 | ≤ 3.0 s | 3.2 s | PGlite; 40 calls \\| slow | **missed** |");
    expect(report.markdown).toContain("| G-5 | `docker compose up` to a healthy stack | ≤ 300.0 s | not measured | — | — |");
    expect(report.markdown).toContain("missed: checklist-points, search-p95; not measured: compose-up.");
  });

  it("writes and reads the records of several jobs from one folder, files in name order", () => {
    const dir = tempDir();
    writeMeasureRecords(dir, "tools", [{ id: "isolation-leaks", value: 0, where: "PGlite", detail: "12 accounts" }]);
    writeMeasureRecords(dir, "onboarding-node", [{ id: "onboarding-node", value: 41_000, where: "Node" }]);
    expect(readMeasureRecords(dir).map((record) => record.id)).toEqual(["onboarding-node", "isolation-leaks"]);
  });

  it("refuses a malformed file with its name, and an unknown measure", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "bad.json"), JSON.stringify([{ id: "nope", value: 1, where: "x" }]));
    expect(() => readMeasureRecords(dir)).toThrow(/bad\.json/);
    expect(() => writeMeasureRecords(dir, "x", [{ id: "search-p95", value: -1, where: "x" }])).toThrow();
  });
});

describe("the Playwright report", () => {
  const report = (status: string, description: string) => ({
    suites: [{ suites: [{ specs: [{ title: "onboarding", tests: [{ annotations: [{ type: "onboarding-ms", description }], results: [{ status }] }] }] }] }],
  });

  it("reads the annotation of a passed test, also from a nested suite and from the result", () => {
    expect(readAnnotationValues(report("passed", "41234"), "onboarding-ms")).toEqual({ ok: true, values: [41_234] });
    const onResult = { suites: [{ specs: [{ title: "t", tests: [{ results: [{ status: "passed", annotations: [{ type: "onboarding-ms", description: "9" }] }] }] }] }] };
    expect(readAnnotationValues(onResult, "onboarding-ms")).toEqual({ ok: true, values: [9] });
  });

  it("ignores a failed test and a value that is not a number", () => {
    expect(readAnnotationValues(report("failed", "41234"), "onboarding-ms")).toEqual({ ok: false, error: "no passed test carries the annotation onboarding-ms" });
    expect(readAnnotationValues(report("passed", "fast"), "onboarding-ms").ok).toBe(false);
  });

  it("refuses a file that is not a Playwright report", () => {
    const result = readAnnotationValues({ tests: [] }, "onboarding-ms");
    expect(result.ok).toBe(false);
  });
});

import type { FunnelReport } from "@softure-ai/analytics/server";
import { describe, expect, it } from "vitest";
import { formatFunnelDays, splitFunnelDays } from "./funnel-days.ts";

const STEPS = ["landing", "waitlist", "signup"] as const;

function window(from: string, total: Record<(typeof STEPS)[number], number>): FunnelReport {
  return { from, to: "2026-11-17", steps: STEPS, rows: [], total };
}

describe("splitFunnelDays", () => {
  it("turns windows of one, two and three days into three days, oldest first", () => {
    const days = splitFunnelDays([
      window("2026-11-17", { landing: 4, waitlist: 1, signup: 0 }),
      window("2026-11-16", { landing: 10, waitlist: 3, signup: 1 }),
      window("2026-11-15", { landing: 10, waitlist: 3, signup: 1 }),
    ]);
    expect(days).toEqual([
      { day: "2026-11-15", counts: { landing: 0, waitlist: 0, signup: 0 } },
      { day: "2026-11-16", counts: { landing: 6, waitlist: 2, signup: 1 } },
      { day: "2026-11-17", counts: { landing: 4, waitlist: 1, signup: 0 } },
    ]);
  });

  it("returns nothing for no windows", () => {
    expect(splitFunnelDays([])).toEqual([]);
  });

  it("refuses windows read across midnight", () => {
    const stale = { ...window("2026-11-16", { landing: 1, waitlist: 0, signup: 0 }), to: "2026-11-16" };
    expect(() => splitFunnelDays([window("2026-11-17", { landing: 0, waitlist: 0, signup: 0 }), stale])).toThrow(
      /window 2 \(2026-11-16\.\.2026-11-16\) does not extend window 1/,
    );
  });
});

describe("formatFunnelDays", () => {
  it("prints one aligned row per day under the step names", () => {
    const table = formatFunnelDays(STEPS, [
      { day: "2026-11-16", counts: { landing: 12, waitlist: 2, signup: 0 } },
      { day: "2026-11-17", counts: { landing: 3, waitlist: 0, signup: 1 } },
    ]);
    expect(table).toBe(
      ["day         landing  waitlist  signup", "2026-11-16  12       2         0", "2026-11-17  3        0         1"].join("\n"),
    );
  });
});

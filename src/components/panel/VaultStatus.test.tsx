// The status cards rendered on the server: never synced, a copy in progress with the index filling, everything done,
// a failed sync and a waiting index in plain words, the keyword-only mode, and the plan's limits against the account's
// use (VC-14).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IndexProgress } from "../../vault/index/index-store.ts";
import type { PlanUsage } from "../../vault/limits/plan-usage.ts";
import { describeStatusError, formatStatusDate, VaultStatus, type SyncSummary } from "./VaultStatus.tsx";

const T0 = new Date("2026-11-17T12:00:00Z");
const EMPTY: IndexProgress = { notes: 0, indexed: 0, passages: 0, lastIndexedAt: null, failure: null };

function run(overrides: Partial<SyncSummary>): SyncSummary {
  return { status: "succeeded", errorCode: null, startedAt: T0, finishedAt: T0, copied: 3, plannedCopies: 3, skippedOverLimit: 0, ...overrides };
}

const TRIAL: PlanUsage = {
  planName: "Trial",
  limits: { notes: 5000, storageMb: 500, searches: 1000 },
  totals: { notes: 120, bytes: 3 * 1024 * 1024 },
  searches: { used: 42, limit: 1000, resetsAt: new Date("2026-12-01T00:00:00Z") },
};

function render(props: Omit<Parameters<typeof VaultStatus>[0], "plan"> & { readonly plan?: PlanUsage | null }): string {
  return renderToStaticMarkup(<VaultStatus plan={null} {...props} />);
}

describe("VaultStatus", () => {
  it("says nothing is copied or indexed yet for a new account", () => {
    const html = render({ latestRun: null, progress: EMPTY, searchByMeaning: true });
    expect(html).toContain("Not copied yet.");
    expect(html).toContain("Nothing to index yet");
    expect(html).not.toContain("Notes indexed");
  });

  it("shows a running copy and the index's progress as notes indexed out of all", () => {
    const html = render({
      latestRun: run({ status: "running", finishedAt: null, copied: 40, plannedCopies: 120 }),
      progress: { notes: 120, indexed: 30, passages: 75, lastIndexedAt: T0, failure: null },
      searchByMeaning: true,
    });
    expect(html).toContain("Copying now");
    expect(html).toContain("40 / 120");
    expect(html).toContain("Indexing");
    expect(html).toContain("30 / 120");
    expect(html).toContain("17 Nov 2026, 12:00 UTC");
    expect(html).toContain("by their words and by their meaning");
  });

  it("shows a finished copy and a complete index", () => {
    const html = render({ latestRun: run({}), progress: { notes: 3, indexed: 3, passages: 9, lastIndexedAt: T0, failure: null }, searchByMeaning: true });
    expect(html).toContain("Up to date");
    expect(html).toContain("Every note is searchable");
  });

  it("names a failed sync and a waiting index in plain words, never as a code", () => {
    const html = render({
      latestRun: run({ status: "failed", errorCode: "source.not_found" }),
      progress: { notes: 3, indexed: 1, passages: 2, lastIndexedAt: T0, failure: { errorCode: "llm.unavailable", failedAt: T0 } },
      searchByMeaning: true,
    });
    expect(html).toContain("The last copy stopped");
    expect(html).toContain("The repository or its branch was not found.");
    expect(html).toContain("Indexing is waiting");
    expect(html).toContain("did not answer. It is tried again on its own.");
    expect(html).not.toContain("llm.unavailable");
    expect(html).not.toContain("source.not_found");
  });

  it("says when search works by words only", () => {
    expect(render({ latestRun: run({}), progress: { notes: 1, indexed: 1, passages: 1, lastIndexedAt: T0, failure: null }, searchByMeaning: false })).toContain(
      "has no model set up for search by meaning",
    );
  });
});

describe("the plan card", () => {
  it("shows the plan, each limit against its use and when searches reset", () => {
    const html = render({ plan: TRIAL, latestRun: run({}), progress: EMPTY, searchByMeaning: true });
    expect(html).toContain('data-testid="status-plan"');
    expect(html).toContain("Plan limits");
    expect(html).toContain("Trial");
    expect(html).toContain("120 of 5000");
    expect(html).toContain("3 MiB of 500 MiB");
    expect(html).toContain("42 of 1000");
    expect(html).toContain("1 Dec 2026, 00:00 UTC");
    expect(html).not.toContain('data-testid="status-over-limit"');
  });

  it("says how many shared notes are left out over the limit, and marks a used-up allowance", () => {
    const plan: PlanUsage = { ...TRIAL, totals: { notes: 5000, bytes: 0 }, searches: { ...TRIAL.searches, used: 1000 } };
    const html = render({ plan, latestRun: run({ skippedOverLimit: 37 }), progress: EMPTY, searchByMeaning: true });
    expect(html).toContain("37 shared notes are over your plan&#x27;s limit, so they are not copied or searchable.");
    expect(html).toContain("5000 of 5000");
    expect(html).toContain("1000 of 1000");
  });

  it("says no limit for a self-hosted instance without plan limits", () => {
    const plan: PlanUsage = { ...TRIAL, planName: "Trial", limits: { notes: null, storageMb: null, searches: null }, searches: { ...TRIAL.searches, limit: null } };
    const html = render({ plan, latestRun: run({}), progress: EMPTY, searchByMeaning: true });
    expect(html).toContain("120 (no limit)");
    expect(html).toContain("3 MiB (no limit)");
    expect(html).toContain("42 (no limit)");
  });

  it("is left out for an account billing does not know", () => {
    expect(render({ latestRun: null, progress: EMPTY, searchByMeaning: true })).not.toContain('data-testid="status-plan"');
  });
});

describe("describeStatusError and formatStatusDate", () => {
  it("falls back to a general sentence for an unknown code and formats dates in UTC", () => {
    expect(describeStatusError("vault.something_new")).toBe("Something went wrong on our side.");
    expect(formatStatusDate(new Date("2026-03-01T23:30:00Z"))).toBe("1 Mar 2026, 23:30 UTC");
  });
});

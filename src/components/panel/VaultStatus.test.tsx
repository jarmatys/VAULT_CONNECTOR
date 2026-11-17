// The status cards rendered on the server: never synced, a copy in progress with the index filling, everything done,
// a failed sync and a waiting index in plain words, and the keyword-only mode.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IndexProgress } from "../../vault/index/index-store.ts";
import { describeStatusError, formatStatusDate, VaultStatus, type SyncSummary } from "./VaultStatus.tsx";

const T0 = new Date("2026-11-17T12:00:00Z");
const EMPTY: IndexProgress = { notes: 0, indexed: 0, passages: 0, lastIndexedAt: null, failure: null };

function run(overrides: Partial<SyncSummary>): SyncSummary {
  return { status: "succeeded", errorCode: null, startedAt: T0, finishedAt: T0, copied: 3, plannedCopies: 3, ...overrides };
}

function render(props: Parameters<typeof VaultStatus>[0]): string {
  return renderToStaticMarkup(<VaultStatus {...props} />);
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

describe("describeStatusError and formatStatusDate", () => {
  it("falls back to a general sentence for an unknown code and formats dates in UTC", () => {
    expect(describeStatusError("vault.something_new")).toBe("Something went wrong on our side.");
    expect(formatStatusDate(new Date("2026-03-01T23:30:00Z"))).toBe("1 Mar 2026, 23:30 UTC");
  });
});

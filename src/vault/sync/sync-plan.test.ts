// The plan's caps in the sync plan (FR-18): notes over the note cap or the storage cap are left out and counted,
// existing copies are kept before new notes, a lowered cap removes copies, and no caps change nothing.
import { describe, expect, it } from "vitest";
import type { SourceFile } from "../sources/source.ts";
import { planSync } from "./sync-plan.ts";

const file = (path: string, size = 10): SourceFile => ({ path, version: `v-${path}`, size });
const FILES = [file("Work/A.md"), file("Work/B.md"), file("Work/C.md"), file("Work/D.md")];
const NONE = new Map<string, string>();

describe("the plan's caps", () => {
  it("copies the first notes by path up to the note cap and counts the rest", () => {
    const plan = planSync({ files: FILES, picks: ["Work"], copies: NONE, caps: { maxNotes: 2, maxBytes: null } });
    expect(plan.copies.map((copy) => copy.path)).toEqual(["Work/A.md", "Work/B.md"]);
    expect(plan.skippedOverLimit).toBe(2);
  });

  it("stops at the storage cap, and still fits a smaller note after a larger one", () => {
    const files = [file("Work/A.md", 40), file("Work/B.md", 70), file("Work/C.md", 50)];
    const plan = planSync({ files, picks: ["Work"], copies: NONE, caps: { maxNotes: null, maxBytes: 100 } });
    expect(plan.copies.map((copy) => copy.path)).toEqual(["Work/A.md", "Work/C.md"]);
    expect(plan.skippedOverLimit).toBe(1);
  });

  it("keeps the notes it already copied before new ones, so a new note never pushes an old one out", () => {
    const copies = new Map([
      ["Work/C.md", "v-Work/C.md"],
      ["Work/D.md", "v-Work/D.md"],
    ]);
    const plan = planSync({ files: FILES, picks: ["Work"], copies, caps: { maxNotes: 3, maxBytes: null } });
    expect(plan.copies.map((copy) => copy.path)).toEqual(["Work/A.md"]);
    expect(plan.removals).toEqual([]);
    expect(plan.skippedOverLimit).toBe(1);
  });

  it("removes copies over a lowered cap, the last by path first", () => {
    const copies = new Map(FILES.map((entry) => [entry.path, entry.version]));
    const plan = planSync({ files: FILES, picks: ["Work"], copies, caps: { maxNotes: 1, maxBytes: null } });
    expect(plan.copies).toEqual([]);
    expect(plan.removals).toEqual(["Work/B.md", "Work/C.md", "Work/D.md"]);
    expect(plan.skippedOverLimit).toBe(3);
  });

  it("copies everything without caps, and with a cap of 0 copies nothing", () => {
    expect(planSync({ files: FILES, picks: ["Work"], copies: NONE }).skippedOverLimit).toBe(0);
    expect(planSync({ files: FILES, picks: ["Work"], copies: NONE, caps: { maxNotes: null, maxBytes: null } }).copies).toHaveLength(4);
    const none = planSync({ files: FILES, picks: ["Work"], copies: NONE, caps: { maxNotes: 0, maxBytes: null } });
    expect(none).toMatchObject({ copies: [], skippedOverLimit: 4 });
  });

  it("does not count unpicked notes, non-notes or oversized notes as over the cap", () => {
    const files = [...FILES, file("Personal/X.md"), file("Work/pic.png"), file("Work/Huge.md", 2 * 1024 * 1024)];
    const plan = planSync({ files, picks: ["Work"], copies: NONE, caps: { maxNotes: 4, maxBytes: null } });
    expect(plan).toMatchObject({ skippedOverLimit: 0, skippedNotNote: 1, skippedTooLarge: 1 });
    expect(plan.copies).toHaveLength(4);
  });
});

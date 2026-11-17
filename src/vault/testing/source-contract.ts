// The behaviour every vault source adapter owes the pipeline, as one suite an adapter's test runs against its own fake:
// the listing names every file with a version, a read answers the listed bytes, the cursor is stable until something
// changes and moves when it does, and a file changed or removed since the listing reads as not found.
import { describe, expect, it } from "vitest";
import type { SourceFile, VaultSource } from "../sources/source.ts";

export interface SourceContractHarness {
  /** A fresh adapter over the current content (adapters may keep what they listed for their lifetime). */
  open(): VaultSource;
  write(path: string, text: string): void;
  remove(path: string): void;
}

export function describeSourceContract(name: string, createHarness: (files: Readonly<Record<string, string>>) => SourceContractHarness): void {
  describe(`${name} meets the vault source contract`, () => {
    const files = { "Welcome.md": "# Welcome\n", "Projects/Garden.md": "# Garden\n", "Projects/Deep/Shed.md": "# Shed\n" };

    async function list(source: VaultSource): Promise<{ readonly cursor: string; readonly files: readonly SourceFile[] }> {
      const listing = await source.listTree();
      if (!listing.ok) throw new Error(`listTree failed with ${listing.error}`);
      return listing.value;
    }

    it("lists every file with its size and a version", async () => {
      const harness = createHarness(files);
      const listing = await list(harness.open());
      expect(listing.files.map((file) => [file.path, file.size]).sort()).toEqual([
        ["Projects/Deep/Shed.md", 7],
        ["Projects/Garden.md", 9],
        ["Welcome.md", 10],
      ]);
      expect(listing.files.every((file) => file.version.length > 0)).toBe(true);
    });

    it("reads the bytes of a listed version", async () => {
      const harness = createHarness(files);
      const source = harness.open();
      const garden = (await list(source)).files.find((file) => file.path === "Projects/Garden.md");
      if (garden === undefined) throw new Error("Projects/Garden.md not listed");
      const bytes = await source.readFile(garden);
      expect(bytes.ok && new TextDecoder().decode(bytes.value)).toBe("# Garden\n");
    });

    it("keeps the cursor while nothing changes and agrees with the listing", async () => {
      const harness = createHarness(files);
      const first = await harness.open().getCursor();
      const second = await harness.open().getCursor();
      const listing = await list(harness.open());
      expect(first.ok && second.ok && first.value === second.value && first.value === listing.cursor).toBe(true);
      const changes = await harness.open().listChangesSince(listing.cursor);
      expect(changes.ok && changes.value.kind === "changes" && changes.value.changes.length).toBe(0);
    });

    it("moves the cursor on an added, changed or removed file", async () => {
      const harness = createHarness(files);
      const cursors = new Set<string>();
      const record = async () => {
        const cursor = await harness.open().getCursor();
        if (!cursor.ok) throw new Error(`getCursor failed with ${cursor.error}`);
        cursors.add(cursor.value);
        return cursor.value;
      };
      const start = await record();
      harness.write("Projects/New.md", "# New\n");
      await record();
      harness.write("Welcome.md", "# Welcome back\n");
      await record();
      harness.remove("Projects/Deep/Shed.md");
      const end = await record();
      expect(cursors.size).toBe(4);
      const changes = await harness.open().listChangesSince(start);
      expect(changes.ok && changes.value.cursor).toBe(end);
    });

    it("reads a file changed or removed since the listing as not found", async () => {
      const harness = createHarness(files);
      const listed = (await list(harness.open())).files;
      const welcome = listed.find((file) => file.path === "Welcome.md");
      const shed = listed.find((file) => file.path === "Projects/Deep/Shed.md");
      if (welcome === undefined || shed === undefined) throw new Error("fixture not listed");
      harness.write("Welcome.md", "# Changed\n");
      harness.remove("Projects/Deep/Shed.md");
      const source = harness.open();
      const changed = await source.readFile(welcome);
      const removed = await source.readFile(shed);
      expect([changed.ok ? "ok" : changed.error, removed.ok ? "ok" : removed.error]).toEqual(["source.not_found", "source.not_found"]);
    });
  });
}

import { describe, expect, it } from "vitest";
import { findCurrentSection, getPanelSections, PANEL_SECTIONS } from "./panel-sections.ts";

describe("findCurrentSection", () => {
  it("marks the overview on the panel's own path", () => {
    expect(findCurrentSection("/panel")).toBe("overview");
  });

  it("marks the section whose path is the longest prefix, not the overview that prefixes them all", () => {
    expect(findCurrentSection("/panel/source")).toBe("source");
    expect(findCurrentSection("/panel/folders")).toBe("folders");
    expect(findCurrentSection("/panel/connectors")).toBe("connectors");
    expect(findCurrentSection("/panel/status")).toBe("status");
    expect(findCurrentSection("/panel/billing")).toBe("billing");
    expect(findCurrentSection("/panel/account")).toBe("account");
    expect(findCurrentSection("/panel/password")).toBe("password");
  });

  it("marks a section for a path below it", () => {
    expect(findCurrentSection("/panel/source/callback")).toBe("source");
  });

  it("marks nothing outside the panel or on a path that only shares a prefix of letters", () => {
    expect(findCurrentSection("/")).toBeNull();
    expect(findCurrentSection("/panelists")).toBeNull();
  });

  it("lists every section once, each under the panel", () => {
    const ids = PANEL_SECTIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { href } of PANEL_SECTIONS) expect(href.startsWith("/panel")).toBe(true);
  });
});

describe("getPanelSections", () => {
  it("lists the plan screen where accounts pay, and leaves it out on an instance without plans", () => {
    expect(getPanelSections(true)).toBe(PANEL_SECTIONS);
    expect(getPanelSections(false).map(({ id }) => id)).toEqual(["overview", "source", "folders", "connectors", "status", "account", "password"]);
  });
});

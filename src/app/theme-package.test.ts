// The Notion theme is the app's only source of tokens and UI parts (DESIGN.md): globals.css imports the theme's
// sheets in the order its README gives for an app with SOFTURE package pages, the root layout loads the package sheet
// first, and no screen paints with a raw colour or an older theme.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = new URL(".", import.meta.url).pathname;
const SRC_DIR = join(APP_DIR, "..");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("globals.css", () => {
  const globals = readFileSync(join(APP_DIR, "globals.css"), "utf8");

  it("imports Tailwind and the Notion theme's sheets in the README's order for an app with package pages", () => {
    const imports = [...globals.matchAll(/^@import "([^"]+)"/gm)].map((match) => match[1]);
    expect(imports).toEqual([
      "tailwindcss/theme.css",
      "@softure-ai/theme-notion/preflight.css",
      "tailwindcss/utilities.css",
      "@softure-ai/theme-notion/theme.css",
      "@softure-ai/theme-notion/sft-bridge.css",
      "@softure-ai/theme-notion/base.css",
      "@softure-ai/theme-notion/page.css",
    ]);
  });

  it("declares no token or rule of its own", () => {
    const rules = globals.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@(import|layer)[^;]*;$/gm, "");
    expect(rules.trim()).toBe("");
  });
});

describe("the root layout", () => {
  it("loads @softure-ai/ui's sheet before globals.css, so the layer order is the package's", () => {
    const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
    const packageSheet = layout.indexOf('import "@softure-ai/ui/styles.css"');
    const globals = layout.indexOf('import "./globals.css"');
    expect(packageSheet).toBeGreaterThanOrEqual(0);
    expect(globals).toBeGreaterThan(packageSheet);
  });
});

describe("the screens", () => {
  const files = [...listSourceFiles(join(SRC_DIR, "app")), ...listSourceFiles(join(SRC_DIR, "components"))];

  it("are found", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("paint with no raw colour", () => {
    const offenders = files.filter((file) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(readFileSync(file, "utf8").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });

  it("import no theme but the Notion theme", () => {
    const offenders = files.filter((file) => /@softure-ai\/theme-(?!notion)/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

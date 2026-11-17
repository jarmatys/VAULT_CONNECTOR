import { readFileSync } from "node:fs";
import { getThemeColor, type ColorScheme } from "@softure-ai/theme-kit";
import { describe, expect, it } from "vitest";
import { AMBER, AMBER_DEEP, BRAND_THEME, BRAND_VARIABLES } from "./brand-theme.ts";

// WCAG 2.2 AA: 4.5:1 for text (SC 1.4.3), 3:1 for the focus ring and control boundaries (SC 1.4.11), the base theme's
// own rules (theme-flat-paint README, "Contrast").
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;
const SURFACES = ["background", "surface", "surface-raised"] as const;
const SCHEMES: readonly ColorScheme[] = ["light", "dark"];

function getLuminance(hex: string): number {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (digits === undefined) throw new Error(`getLuminance: cannot parse colour "${hex}"`);
  const [red, green, blue] = [0, 2, 4].map((start) => {
    const channel = Number.parseInt(digits.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrast(first: string, second: string, scheme: ColorScheme): number {
  const [lighter, darker] = [getThemeColor(BRAND_THEME, first, scheme), getThemeColor(BRAND_THEME, second, scheme)]
    .map(getLuminance)
    .sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** The custom properties declared in each block of src/app/brand.css, keyed by the block's selector. */
function readBrandCss(): Map<string, Record<string, string>> {
  const css = readFileSync(new URL("../app/brand.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = new Map<string, Record<string, string>>();
  for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim();
    const declarations = Object.fromEntries(
      (match[2] ?? "")
        .split(";")
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration !== "")
        .map((declaration) => {
          const colon = declaration.indexOf(":");
          return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
        }),
    );
    blocks.set(selector, declarations);
  }
  return blocks;
}

describe("the brand accent", () => {
  it("replaces the base's lime in every accent role, never with Obsidian's purple", () => {
    for (const scheme of SCHEMES) {
      expect(getThemeColor(BRAND_THEME, "accent-fill", scheme)).toBe(AMBER);
      expect(getThemeColor(BRAND_THEME, "primary", scheme)).toBe(AMBER);
      expect(getThemeColor(BRAND_THEME, "lime", scheme)).toBe(AMBER);
    }
    expect(getThemeColor(BRAND_THEME, "accent", "light")).toBe(AMBER_DEEP);
    expect(getThemeColor(BRAND_THEME, "accent", "dark")).toBe(AMBER);
  });

  describe.each(SCHEMES)("in the %s scheme", (scheme) => {
    it("puts ink text on the fill and its hover at 4.5:1 or more", () => {
      expect(getContrast("on-accent", "accent-fill", scheme)).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(getContrast("on-accent", "accent-fill-hover", scheme)).toBeGreaterThanOrEqual(TEXT_MIN);
    });

    it("reads accent text at 4.5:1 or more on every surface", () => {
      for (const surface of SURFACES) {
        expect([surface, getContrast("accent", surface, scheme) >= TEXT_MIN]).toEqual([surface, true]);
      }
    });

    it("draws the focus ring at 3:1 or more on every surface", () => {
      for (const surface of SURFACES) {
        expect([surface, getContrast("ring", surface, scheme) >= NON_TEXT_MIN]).toEqual([surface, true]);
      }
    });

    it("puts white text on the deep flag at 4.5:1 or more", () => {
      expect(getContrast("paper", "lime-deep", scheme)).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  });
});

describe("src/app/brand.css", () => {
  const blocks = readBrandCss();

  it("declares the light values for the default and the chosen light scheme", () => {
    expect(blocks.get(':root, .light, [data-theme="light"]')).toEqual(BRAND_VARIABLES.light);
  });

  it("declares the dark values for the system's dark scheme and the chosen dark scheme", () => {
    expect(blocks.get(':root:not(.light, [data-theme="light"])')).toEqual(BRAND_VARIABLES.dark);
    expect(blocks.get('.dark, [data-theme="dark"]')).toEqual(BRAND_VARIABLES.dark);
  });

  it("matches the theme definition for every overridden colour and the selected-row bar", () => {
    for (const scheme of SCHEMES) {
      const variables: Readonly<Record<string, string>> = BRAND_VARIABLES[scheme];
      for (const [name, value] of Object.entries(variables)) {
        if (name === "--shadow-selected-row") {
          expect(value).toBe(BRAND_THEME.shadows?.["selected-row"]?.[scheme]);
        } else {
          expect([name, value]).toEqual([name, getThemeColor(BRAND_THEME, name.slice(2), scheme)]);
        }
      }
    }
  });
});

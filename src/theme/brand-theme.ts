// VaultConnector's theme: Flat Paint with the product's accent, warm amber, in place of the base's lime (DESIGN.md).
// The palette names stay the base's (`lime`, `lime-hover`, `lime-deep`) because the base's look maps and page styles
// paint with them; only their values change. src/app/brand.css carries the same values as CSS variables, and
// src/theme/brand-theme.test.ts holds the two equal and measures their contrast.
import { extendTheme } from "@softure-ai/theme-kit";
import { FLAT_PAINT_THEME } from "@softure-ai/theme-flat-paint";

/** The accent's flat fill: the primary button, an active tab, a shared folder's mark. Always with ink text on it. */
export const AMBER = "#f2b84b";
/** The fill under the pointer. */
export const AMBER_HOVER = "#e5a832";
/** Accent text and the focus ring on light surfaces, where the fill has too little contrast to be a line or text. */
export const AMBER_DEEP = "#8a5a00";
/** The text on the fill, in both schemes. */
const INK = "#0c0c0d";

const BOTH = (value: string) => ({ light: value, dark: value });

export const BRAND_THEME = extendTheme(FLAT_PAINT_THEME, {
  name: "VaultConnector",
  colors: {
    lime: BOTH(AMBER),
    "lime-hover": BOTH(AMBER_HOVER),
    "lime-deep": BOTH(AMBER_DEEP),
    accent: { light: AMBER_DEEP, dark: AMBER },
    "accent-fill": BOTH(AMBER),
    "accent-fill-hover": BOTH(AMBER_HOVER),
    "on-accent": BOTH(INK),
  },
  shadows: {
    "selected-row": BOTH(`inset 3px 0 0 ${AMBER}`),
  },
});

/** The CSS variables the brand overrides, per scheme, as src/app/brand.css must declare them. */
export const BRAND_VARIABLES = {
  light: {
    "--lime": AMBER,
    "--lime-hover": AMBER_HOVER,
    "--lime-deep": AMBER_DEEP,
    "--accent": AMBER_DEEP,
    "--accent-fill": AMBER,
    "--accent-fill-hover": AMBER_HOVER,
    "--on-accent": INK,
    "--shadow-selected-row": `inset 3px 0 0 ${AMBER}`,
  },
  dark: {
    "--lime": AMBER,
    "--lime-hover": AMBER_HOVER,
    "--lime-deep": AMBER_DEEP,
    "--accent": AMBER,
    "--accent-fill": AMBER,
    "--accent-fill-hover": AMBER_HOVER,
    "--on-accent": INK,
    "--shadow-selected-row": `inset 3px 0 0 ${AMBER}`,
  },
} as const;

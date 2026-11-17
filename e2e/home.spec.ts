// The placeholder home page on both hosts: the product's copy, the source link (AGPL-3.0 section 13) and the theme with
// the product's amber accent in both schemes.
import { expect, test } from "@playwright/test";
import { uiMessages } from "@softure-ai/ui";
import { en } from "../src/messages/en.ts";
import { DEFAULT_SOURCE_CODE_URL } from "../src/settings.ts";
import { AMBER, AMBER_DEEP } from "../src/theme/brand-theme.ts";

/** `#rrggbb` as the `rgb(r, g, b)` that getComputedStyle reports. */
function toComputedRgb(hex: string): string {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`;
}

const themeCopy = uiMessages.en.themeSwitch;

test.use({ colorScheme: "light" });

test("the home page states the promise and links to the source code", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(en.meta.title);
  await expect(page.getByRole("heading", { level: 1, name: en.home.title })).toBeVisible();
  await expect(page.getByText(en.home.lead)).toBeVisible();
  await expect(page.getByRole("link", { name: en.home.sourceCode })).toHaveAttribute("href", DEFAULT_SOURCE_CODE_URL);
});

test("the primary action is painted amber, and accent text is deep amber in light and amber in dark", async ({ page }) => {
  await page.goto("/");
  const action = page.getByRole("link", { name: en.home.sourceCode });
  const html = page.locator("html");
  await expect(action).toHaveCSS("background-color", toComputedRgb(AMBER));
  await expect(html).toHaveCSS("--accent", AMBER_DEEP);

  // The radios are visually hidden; people click their labels.
  await page.getByRole("group", { name: themeCopy.legend }).getByText(themeCopy.dark, { exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(action).toHaveCSS("background-color", toComputedRgb(AMBER));
  await expect(html).toHaveCSS("--accent", AMBER);
});

// The landing page on both hosts: the promise, the five pains with their answers, the waitlist form, the source link
// (AGPL-3.0 section 13), and the theme with the product's amber accent in both schemes.
import { expect, test } from "@playwright/test";
import { uiMessages } from "@softure-ai/ui";
import { waitlistMessages } from "@softure-ai/waitlist";
import { en } from "../src/messages/en.ts";
import { DEFAULT_SOURCE_CODE_URL } from "../src/settings.ts";
import { AMBER, AMBER_DEEP } from "../src/theme/brand-theme.ts";

/** `#rrggbb` as the `rgb(r, g, b)` that getComputedStyle reports. */
function toComputedRgb(hex: string): string {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`;
}

const copy = en.landing;
const themeCopy = uiMessages.en.themeSwitch;

test.use({ colorScheme: "light" });

test("the landing page states the promise, the five pains and their answers, and links the source code", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(en.meta.title);
  await expect(page.getByRole("heading", { level: 1, name: copy.title })).toBeVisible();
  await expect(page.getByText(copy.lead)).toBeVisible();

  const pains = page.getByRole("region", { name: copy.painsTitle }).getByRole("listitem");
  await expect(pains).toHaveCount(5);
  for (const [index, { pain, answer }] of copy.pains.entries()) {
    await expect(pains.nth(index)).toContainText(pain);
    await expect(pains.nth(index)).toContainText(answer);
  }

  await expect(page.getByRole("link", { name: copy.sourceCode })).toHaveAttribute("href", DEFAULT_SOURCE_CODE_URL);
});

test("the waitlist form asks for an address and the consent, with the privacy policy linked", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("region", { name: copy.waitlistTitle });
  await expect(form.getByRole("textbox", { name: waitlistMessages.en.form.email })).toBeVisible();
  await expect(form.getByRole("checkbox")).not.toBeChecked();
  await expect(form.getByRole("link", { name: copy.privacyPolicy })).toHaveAttribute("href", "/privacy");
  await expect(form.getByRole("button", { name: waitlistMessages.en.form.submit })).toBeVisible();
});

test("the primary actions are painted amber, and accent text is deep amber in light and amber in dark", async ({ page }) => {
  await page.goto("/");
  const action = page.getByRole("link", { name: copy.sourceCode });
  const join = page.getByRole("button", { name: waitlistMessages.en.form.submit });
  const html = page.locator("html");
  await expect(action).toHaveCSS("background-color", toComputedRgb(AMBER));
  await expect(join).toHaveCSS("background-color", toComputedRgb(AMBER));
  await expect(html).toHaveCSS("--accent", AMBER_DEEP);

  // The radios are visually hidden; people click their labels.
  await page.getByRole("group", { name: themeCopy.legend }).getByText(themeCopy.dark, { exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(action).toHaveCSS("background-color", toComputedRgb(AMBER));
  await expect(html).toHaveCSS("--accent", AMBER);
});

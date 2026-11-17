// The legal pages on both hosts (PRD FR-2): every page carries the legal footer, and its links open the privacy
// policy and the terms, each with the version in force and its change history.
import { expect, test, type Page } from "@playwright/test";
import { privacyMessages } from "@softure-ai/privacy";
import { en } from "../src/messages/en.ts";
import { legalEn } from "../src/messages/legal.ts";
import { DEFAULT_SOURCE_CODE_URL } from "../src/settings.ts";

const footerName = privacyMessages.en.legal.footer;

function legalFooter(page: Page) {
  return page.getByRole("contentinfo").getByRole("navigation", { name: footerName });
}

const PAGES = ["/", "/privacy", "/terms"];

for (const path of PAGES) {
  test(`the footer of ${path} links to both documents, the source code and the builder`, async ({ page }) => {
    await page.goto(path);
    const footer = legalFooter(page);
    await expect(footer.getByRole("link", { name: en.footer.privacy, exact: true })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: en.footer.terms, exact: true })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: en.footer.sourceCode, exact: true })).toHaveAttribute("href", DEFAULT_SOURCE_CODE_URL);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: en.footer.builtBy })).toHaveAttribute("href", "https://armatys.me");
  });
}

test("a visitor opens the privacy policy from the footer and reads its version and history", async ({ page }) => {
  await page.goto("/");
  await legalFooter(page).getByRole("link", { name: en.footer.privacy, exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle(`${legalEn.privacyPolicy.title} · ${en.meta.title}`);
  await expect(page.getByRole("heading", { level: 1, name: legalEn.privacyPolicy.title })).toBeVisible();
  for (const section of legalEn.privacyPolicy.sections) {
    await expect(page.getByRole("heading", { level: 2, name: section.title, exact: true })).toBeVisible();
  }
  await expect(page.getByText("November 17, 2026").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: privacyMessages.en.legal.changes })).toBeVisible();
  // An instance that sets no OPERATOR_NAME names nobody, and no placeholder is left.
  await expect(page.getByText(`It is run by ${legalEn.unnamedOperator}.`)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("{operator}");
});

test("a visitor opens the terms from the footer of the privacy policy", async ({ page }) => {
  await page.goto("/privacy");
  await legalFooter(page).getByRole("link", { name: en.footer.terms, exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page).toHaveTitle(`${legalEn.terms.title} · ${en.meta.title}`);
  await expect(page.getByRole("heading", { level: 1, name: legalEn.terms.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: privacyMessages.en.legal.changes })).toBeVisible();
  await expect(page.getByText("First version.")).toBeVisible();
});

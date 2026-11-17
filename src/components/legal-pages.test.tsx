// The legal pages and the footer rendered on the server, as the prerender does: what the policy must name (PRD FR-2),
// the operator from settings, and every link of the footer.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { legalEn } from "../messages/legal.ts";
import { en } from "../messages/en.ts";
import { BUILDER_URL, SiteFooter } from "./legal-footer.tsx";
import { LegalPage } from "./legal-page.tsx";

const OPERATOR = { name: "Example Notes Ltd", contact: "privacy@example.com" };

function renderPolicy(operator: typeof OPERATOR | null = OPERATOR): string {
  return renderToStaticMarkup(<LegalPage id="privacy-policy" copy={legalEn.privacyPolicy} operator={operator} />);
}

describe("the privacy policy page", () => {
  it("has a section for every topic the policy must cover", () => {
    const html = renderPolicy();
    for (const id of ["what-we-store", "where-it-is-stored", "how-we-use-it", "no-training", "processors", "how-long-we-keep-it", "your-rights"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("names what is stored, the EU, the processors, retention, no training and how to delete", () => {
    const html = renderPolicy();
    expect(html).toContain("Copies of the folders you picked");
    expect(html).toContain("The search index of those notes");
    expect(html).toContain("Account data");
    expect(html).toContain("stored in the European Union");
    expect(html).toContain("Cloudflare");
    expect(html).toContain("Neon");
    expect(html).toContain("at most 31 days later");
    expect(html).toContain("never used to train any AI model");
    expect(html).toContain("computed by Cloudflare Workers AI");
    expect(html).not.toContain("being decided");
    expect(html).toContain("delete your account and everything in it from the panel");
  });

  it("names the operator and the contact from settings, with no placeholder left", () => {
    const html = renderPolicy();
    expect(html).toContain("It is run by Example Notes Ltd.");
    expect(html).toContain("at privacy@example.com");
    expect(html).not.toMatch(/\{operator\}|\{contact\}/);
  });

  it("uses the neutral wording on an instance that names no operator", () => {
    const html = renderPolicy(null);
    expect(html).toContain(`It is run by ${legalEn.unnamedOperator}.`);
    expect(html).not.toMatch(/\{operator\}|\{contact\}/);
  });

  it("shows the version in force and the change history", () => {
    const html = renderPolicy();
    expect(html).toContain("<h1");
    expect(html).toContain(legalEn.privacyPolicy.title);
    expect(html).toContain("November 17, 2026");
    expect(html).toContain('id="legal-changes"');
    expect(html).toContain("First version.");
  });
});

describe("the terms page", () => {
  it("renders every section with the operator filled in and the change history", () => {
    const html = renderToStaticMarkup(<LegalPage id="terms" copy={legalEn.terms} operator={OPERATOR} />);
    for (const section of legalEn.terms.sections) expect(html).toContain(`id="${section.id}"`);
    expect(html).toContain("run by Example Notes Ltd.");
    expect(html).toContain("GNU Affero General Public License");
    expect(html).toContain('id="legal-changes"');
    expect(html).not.toMatch(/\{operator\}|\{contact\}/);
  });
});

describe("SiteFooter", () => {
  it("links to the privacy policy, the terms, the source code and the builder", () => {
    const html = renderToStaticMarkup(<SiteFooter sourceCodeUrl="https://git.example.com/fork" />);
    expect(html).toMatch(/^<footer>/);
    expect(html).toContain(`<a href="/privacy"`);
    expect(html).toContain(`<a href="/terms"`);
    expect(html).toContain(`<a href="https://git.example.com/fork"`);
    expect(html).toContain(`<a href="${BUILDER_URL}" class="text-muted-foreground underline underline-offset-2">${en.footer.builtBy}</a>`);
    for (const label of [en.footer.privacy, en.footer.terms, en.footer.sourceCode]) expect(html).toContain(`>${label}</a>`);
  });
});

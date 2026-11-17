import type { Metadata } from "next";
import { LegalPage } from "../../../components/legal-page.tsx";
import { en } from "../../../messages/en.ts";
import { legalEn } from "../../../messages/legal.ts";
import { readSettings } from "../../../settings.ts";

export const metadata: Metadata = {
  title: `${legalEn.terms.title} · ${en.meta.title}`,
  description: legalEn.terms.description,
};

// Prerendered: OPERATOR_NAME and OPERATOR_CONTACT are read at build time.
export default function TermsPage() {
  return <LegalPage id="terms" copy={legalEn.terms} operator={readSettings(process.env).operator} />;
}

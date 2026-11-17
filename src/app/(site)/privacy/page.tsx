import type { Metadata } from "next";
import { LegalPage } from "../../../components/legal-page.tsx";
import { en } from "../../../messages/en.ts";
import { legalEn } from "../../../messages/legal.ts";
import { readSettings } from "../../../settings.ts";

export const metadata: Metadata = {
  title: `${legalEn.privacyPolicy.title} · ${en.meta.title}`,
  description: legalEn.privacyPolicy.description,
};

// Prerendered: OPERATOR_NAME and OPERATOR_CONTACT are read at build time.
export default function PrivacyPolicyPage() {
  return <LegalPage id="privacy-policy" copy={legalEn.privacyPolicy} operator={readSettings(process.env).operator} />;
}

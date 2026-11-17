// The terms and the privacy policy as links, for the consent label and the GitHub notice.
import { LEGAL_PATHS } from "../../lib/legal-documents.ts";
import { en } from "../../messages/en.ts";

export function LegalLinks() {
  return (
    <>
      <a href={LEGAL_PATHS.terms} className="text-accent underline">
        {en.auth.terms}
      </a>
      {en.auth.consentBetween}
      <a href={LEGAL_PATHS["privacy-policy"]} className="text-accent underline">
        {en.auth.privacy}
      </a>
    </>
  );
}

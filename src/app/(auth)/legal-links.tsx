// The terms and the privacy policy as links, for the consent label and the GitHub notice. The pages are VC-3's.
import { en } from "../../messages/en.ts";

export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";

export function LegalLinks() {
  return (
    <>
      <a href={TERMS_PATH} className="text-accent underline">
        {en.auth.terms}
      </a>
      {en.auth.consentBetween}
      <a href={PRIVACY_PATH} className="text-accent underline">
        {en.auth.privacy}
      </a>
    </>
  );
}

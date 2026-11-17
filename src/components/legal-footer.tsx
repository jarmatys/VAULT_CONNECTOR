import { privacyMessages } from "@softure-ai/privacy";
import { LegalFooter } from "@softure-ai/privacy/ui";
import { LEGAL_PATHS } from "../lib/legal-documents.ts";
import { en } from "../messages/en.ts";

/** The builder's site, credited on every page (DESIGN.md, "Footer"). */
export const BUILDER_URL = "https://armatys.me";

export interface SiteFooterProps {
  /** Where this instance's source code can be read (AGPL-3.0 section 13), from `SOURCE_CODE_URL`. */
  readonly sourceCodeUrl: string;
}

/** The legal footer of every page: the privacy policy, the terms, the source code and the builder's credit. */
export function SiteFooter({ sourceCodeUrl }: SiteFooterProps) {
  return (
    <footer>
      <LegalFooter
        as="div"
        links={[
          { href: LEGAL_PATHS["privacy-policy"], label: en.footer.privacy },
          { href: LEGAL_PATHS.terms, label: en.footer.terms },
          { href: sourceCodeUrl, label: en.footer.sourceCode },
        ]}
        note={<a href={BUILDER_URL}>{en.footer.builtBy}</a>}
        messages={privacyMessages.en}
      />
    </footer>
  );
}

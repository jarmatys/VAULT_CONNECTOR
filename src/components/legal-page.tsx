import { privacyMessages } from "@softure-ai/privacy";
import { LegalDocument, type LegalSectionContent } from "@softure-ai/privacy/ui";
import { getLegalDocument, type LegalDocumentId } from "../lib/legal-documents.ts";
import { fillOperator } from "../lib/legal-text.ts";
import type { LegalDocumentCopy } from "../messages/legal.ts";
import type { Operator } from "../settings.ts";

export interface LegalPageProps {
  readonly id: LegalDocumentId;
  readonly copy: LegalDocumentCopy;
  readonly operator: Operator | null;
}

/** One legal document as a page: the privacy module's shell with the app's text, version and change history. */
export function LegalPage({ id, copy, operator }: LegalPageProps) {
  const sections: LegalSectionContent[] = copy.sections.map((section) => ({
    id: section.id,
    title: section.title,
    content: (
      <>
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{fillOperator(paragraph, operator)}</p>
        ))}
        {section.items === undefined ? null : (
          <ul className="list-disc pl-6">
            {section.items.map((item) => (
              <li key={item}>{fillOperator(item, operator)}</li>
            ))}
          </ul>
        )}
      </>
    ),
  }));
  return (
    <main className="py-12">
      <LegalDocument
        title={copy.title}
        intro={<p>{fillOperator(copy.intro, operator)}</p>}
        document={getLegalDocument(id)}
        sections={sections}
        listChangesInContents
        messages={privacyMessages.en}
        locale="en"
      />
    </main>
  );
}

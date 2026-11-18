import { List, ListItem, ListRow } from "@softure-ai/theme-notion";
import type { ReactNode } from "react";
import { DOCS_PATH } from "../../../docs/docs-content.ts";
import { loadDocPages } from "../../../docs/load-docs.ts";
import { en } from "../../../messages/en.ts";

// The docs' frame (VC-17): the list of pages beside the page on a wide screen, above it on a phone. Prerendered with
// the pages, so the files are read at build time.
export default function DocsLayout({ children }: { readonly children: ReactNode }) {
  const pages = loadDocPages();
  return (
    <div data-slot="docs" className="mx-auto grid w-full max-w-content-width-wide gap-8 px-4 py-12 md:grid-cols-[13rem_minmax(0,1fr)] md:py-16">
      <nav aria-label={en.docs.navLabel} className="md:sticky md:top-8 md:self-start">
        <List>
          <ListItem>
            <ListRow asChild>
              <a href={DOCS_PATH}>{en.docs.title}</a>
            </ListRow>
          </ListItem>
          {pages.map((page) => (
            <ListItem key={page.slug}>
              <ListRow asChild>
                <a href={`${DOCS_PATH}/${page.slug}`}>{page.title}</a>
              </ListRow>
            </ListItem>
          ))}
        </List>
      </nav>
      <div className="min-w-0 max-w-content-width">{children}</div>
    </div>
  );
}

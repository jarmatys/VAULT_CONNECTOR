// The names agents read about the connector (VC-17, FR-21): the agent-ready module's identity, and the docs' entries in
// sitemap.xml. Plain values, so softure.config.ts stays light.
import { DOCS_PATH, PUBLISHED_DOC_SLUGS } from "./docs-content.ts";

/** The server card's reverse-DNS name; the source code's GitHub namespace, since the product's domain is not set yet. */
export const AGENT_READY_NAME = "io.github.jarmatys/vaultconnector";

export const AGENT_READY_DESCRIPTION =
  "VaultConnector gives an assistant read-only access to the folders a person picked from their Obsidian vault: a table of contents, search with note paths, and whole notes.";

export const AGENT_READY_PROVIDER = "VaultConnector";

/** The public health check, listed as the API catalog's `status`. */
export const HEALTH_PATH = "/api/health";

/** The docs in sitemap.xml: the home, then every page. */
export const DOCS_SITEMAP_ENTRIES = [
  { path: DOCS_PATH, priority: 0.6 },
  ...PUBLISHED_DOC_SLUGS.map((slug) => ({ path: `${DOCS_PATH}/${slug}`, priority: 0.5 })),
];

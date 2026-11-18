// Bundles `content/docs/*.md` into `src/docs/doc-sources.generated.ts`, the module the docs pages are served from.
// Run `npm run docs:bundle` after changing a docs file; a test fails while the bundle and the folder differ.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderDocSourcesModule } from "../src/docs/doc-sources-module.ts";
import { readDocSources } from "../src/docs/load-docs.ts";

const target = join(process.cwd(), "src", "docs", "doc-sources.generated.ts");
writeFileSync(target, renderDocSourcesModule(readDocSources()));
console.log(`docs:bundle: wrote ${target}`);

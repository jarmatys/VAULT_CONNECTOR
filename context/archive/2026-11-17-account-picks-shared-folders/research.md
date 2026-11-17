# Research: account-picks-shared-folders

## Today
- VC-6 left one source per account (`vault.sources`, unique `user_id`), the source interface
  (`src/vault/sources/source.ts`: `getCursor`, `listTree`, `readFile`, `listChangesSince`) and the git adapter. The
  account's repository becomes a `VaultSource` through `createAccountGithubSource(ctx, stored)`
  (`src/vault/sources/github/link.ts`), which mints a read-only token of that one repository per call.
- `listTree` costs two GitHub calls (head commit, recursive tree) and refuses a truncated tree (`source.too_large`).
  It lists files only (blobs), so folders are derived from file paths.
- The panel lives under `/panel` (`src/panel-paths.ts`); the roadmap's `src/app/(panel)/folders/**` is
  `src/app/(panel)/panel/folders/**` in today's layout. The panel home has one "next step" card that leads to the
  source screen.
- Copy lives in `src/messages/en.ts`; screens use `@softure-ai/ui` (`Card`, `Button`, `ButtonAnchor`) with the
  `@softure-ai/theme-flat-paint` looks. No client components so far: forms post to server actions.
- Tests: unit tests on PGlite (`createTestDatabase([auth(), vault()])`, `createTestAccount`), the fake GitHub
  (`src/vault/testing/fake-github.ts`) on `@softure-ai/connections/testing`'s fake App; e2e on both hosts against
  `e2e/fake-services.mjs`. The fake App answered installations and tokens but no repository contents.

## SOFTURE modules
- No `@softure-ai/*` module covers picking folders of a user's file tree (product-specific, built here).
- Gap: `createFakeGithubApp` had no repository contents, so neither the unit tests nor the e2e could list a tree
  through the real adapter. Fixed in SOFTURE/AI (`@softure-ai/connections` 0.6.0: `files`, `commitFiles`,
  `rewriteHistory`, the git data API routes).

## Unknown: default ignore rules
- The owner's prototype skips `.obsidian/**`, `.github/**`, `.trash/**` and `**/*.excalidraw.md` at sync time.
- Obsidian's own config and trash folders start with a dot; git metadata (`.git*`), editor folders (`.vscode`) and
  other tools' folders do too. Nothing in a dot folder is a note a person means to share.
- Decision: the tree never shows a folder whose name starts with a dot (at any depth), and counts as notes only
  Markdown files (`.md`, case-insensitive) that are not Excalidraw drawings (`*.excalidraw.md`). Folders with no note
  inside (attachments only) are not shown: nothing in them reaches the tools. The same rules decide later what is
  copied (VC-8), so they live in one module.

## Isolation and the core rule
- Picks are stored per account (`user_id` references `auth.users`, `ON DELETE CASCADE`) and tied to the source row
  (`source_id` references `vault.sources`, `ON DELETE CASCADE`): disconnecting forgets the picks, so a new repository
  never inherits another repository's picks. Connecting a different repository on the same row clears the picks too.
- A saved path must be a folder of the current tree; anything else in the form is refused (a crafted form cannot
  share a path the account never saw).
- A picked folder shares its subfolders. The stored set is minimal (a child of a picked folder is not stored), and
  `isPathShared(path, folders)` answers for one note path; VC-8 and the tools use it.

## Files
- `src/vault/folders/folder-tree.ts` (+ test): note and ignore rules, the tree with note counts.
- `src/vault/folders/shared-folders.ts` (+ test): pick normalisation, `isPathShared`, store (read, replace).
- `src/vault/folders/load-folders.ts`: the account's tree and picks for the screen.
- `src/vault/migrations/0002_create_shared_folders.sql`, `src/vault/module.ts` (table list).
- `src/vault/sources/store.ts`: clear picks when the repository changes.
- `src/app/(panel)/panel/folders/{page.tsx,actions.ts}`, `src/app/(panel)/panel/page.tsx` (second step),
  `src/messages/en.ts` (folders).
- `e2e/fake-services.mjs` (fixture vault in the fake App), `e2e/folders.spec.ts`.

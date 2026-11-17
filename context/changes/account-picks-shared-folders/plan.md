# Plan: account-picks-shared-folders

## Approach
A pure folder-tree builder over the source's file listing (one set of note and ignore rules), a `vault.shared_folders`
table tied to the account and its source, a store that replaces the account's picks in one transaction after checking
each path against the current tree, and a panel screen `/panel/folders` (server component, nested checkboxes in one
form, a server action) reachable from the panel home once a source is connected.

## Decisions (auto)
- Ignore rules: no dot folder at any depth; notes are `*.md` but not `*.excalidraw.md`; folders without a note are not
  shown. Shown nowhere, pickable never.
- A picked folder shares everything below it; the store keeps the minimal set. Notes at the top level of the vault
  (outside any folder) are not shared by any pick; the screen says so.
- Saving replaces the whole set; paths not in the current tree are refused with a message and nothing is saved.
  Picks whose folder has since left the vault stay stored (harmless: they match nothing) and are listed on the screen
  as missing; the next save drops them.
- The tree is read live from the source on each visit (two GitHub calls); a source failure shows a message by code
  (disconnected → the source screen, rate limited or unavailable → try again, too large → the vault is too big to list).
  VC-8's synced copy can replace the live read later.
- Picks are tied to the source row and cleared when the repository changes or the source is deleted.
- No client JavaScript: ticking a parent in the browser does not tick its children; on the next view, folders under a
  picked folder show as included (checked and disabled).
- Copy in `en.ts` under `folders`; no new SOFTURE package needed.

## Phases
1. **Rules, tree and store** (TDD): `folder-tree.ts`, `shared-folders.ts`, migration 0002, module table list,
   `store.ts` clearing picks on a new repository. Done when unit tests cover dot folders at depth, Excalidraw,
   case of `.MD`, empty folders, counts that include subfolders, normalisation (child of a picked folder, duplicates),
   `isPathShared` (prefix that is not a folder boundary, top-level notes), refusing a path outside the tree, replacing
   and clearing picks, another account's picks untouched, picks gone with the source and on a new repository.
2. **Screen and e2e**: `load-folders.ts`, `/panel/folders` page and action, panel home second step, `en.ts`, the fixture
   vault in `e2e/fake-services.mjs`, `e2e/folders.spec.ts`. Done when the e2e on both hosts opens the picker with
   nothing ticked and note counts, ticks two folders, saves, sees them saved (database rows equal the two paths),
   unticks one and sees it gone; and the unit test of the loader covers a disconnected source.
3. **Docs and close**: change.md `## Done`, archive.

## Progress
- [x] Phase 1: rules, tree and store; `npx vitest run src/vault/folders` 11/11 (crafted paths, other account, source gone, new repository, database checks)
- [ ] Phase 2: screen and e2e
- [ ] Phase 3: docs and close

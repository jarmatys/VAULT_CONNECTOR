# Plan: text-helpers-move-to-packages

One phase: bump core to ^0.2.11 and mcp-access to ^0.7.7; `src/mcp/untrusted.ts` becomes the app's binding of
`createUntrustedWrapper` to its marker copy (same exports, so callers do not change); `foldForSearch` is replaced by
`foldWords`, `fold-for-search.ts` keeps `buildKeywordQuery`; the moved tests are removed (they live in the packages).

## Progress

- [x] Phase 1: packages bumped, local copies removed, gates green.

# Plan: helpers-move-to-packages

One phase: the packages released (SOFTURE/AI change `vault-helpers-to-packages`), the local files and their tests
deleted (the tests moved with the code), every import pointed at the package, versions bumped, docs refreshed. Gates:
typecheck, lint, the unit suite.

## Progress

- [x] Phase 1: packages bumped, local copies removed, imports switched, docs and PRD refreshed.

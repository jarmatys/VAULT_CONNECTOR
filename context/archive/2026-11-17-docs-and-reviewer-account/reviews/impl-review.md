# Implementation review: Docs and the reviewer account (VC-17)

Verdict: approve. The implementation follows plan.md; every phase has tests.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | `src/site.test.ts` pinned the sitemap to three entries and went red once the docs joined it. | Fixed: the test expects `DOCS_SITEMAP_ENTRIES` after the legal pages. |
| 2 | Suggestion | `next.config.ts` `async headers()` without `await` failed the lint gate. | Fixed: `headers: () => Promise.resolve(nextHeaders(...))`. |
| 3 | Suggestion | `toHeadingId` held combining marks as literal characters, which the language gate reads as diacritics. | Fixed: `̀-ͯ` escapes. |
| 4 | Note | The reviewer's password is printed once to the operator's terminal and never stored by the command; the account is ordinary, so the privacy export and deletion cover it. | Kept. |
| 5 | Note | The discovery documents introspect a server without the database; a tool call on it refuses. Unit tests run the package's guards (catalog targets exist, skill digests match, no account data, card tools match). | Kept. |

Evidence: `npx vitest run` 65 files, 614 tests green after fix 1; `npx tsc --noEmit` clean once theme-notion 0.25.0 is installed; e2e `e2e/docs.spec.ts` runs on both hosts in CI.

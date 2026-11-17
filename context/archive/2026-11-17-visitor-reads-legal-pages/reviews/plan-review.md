# Plan review: visitor-reads-legal-pages

Verdict: approve.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | Holding the declarations outside the privacy module could drift from what consents record later. | Accepted: one exported array, in the module's own input shape, is handed to `privacy({ documents })` by VC-5/VC-16; the normaliser's test pins version = newest date. |
| 2 | Warning | Root layout, `en.ts` and `settings.ts` are shared with VC-2 and VC-5. | Keep edits additive (one import and one element in the layout, one key in `en.ts`, two optional settings); rebase on conflict. |
| 3 | Suggestion | The "every page" claim needs a check on more than one route group. | E2E checks `/` and both legal pages (two route groups today); the panel group (VC-5) inherits the root layout. |
| 4 | Suggestion | Prerendered pages freeze `OPERATOR_*` at build time. | Accepted: same rule as `SOURCE_CODE_URL`; noted in the settings comment. |

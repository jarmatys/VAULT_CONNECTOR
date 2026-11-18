# Plan review: Docs and the reviewer account (VC-17)

Verdict: approve with the changes below (applied to plan.md).

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The discovery documents would call the account factory with the nil account and query the database on every request (and fail in tests without one). | Accepted: a discovery factory with the same tools and instructions and no database. |
| 2 | Warning | A failure after `registerUser` (bucket refused, empty vault) would leave a half-made account. | Accepted: erase it on every later failure; tested. |
| 3 | Suggestion | The checklist's evidence paths can rot. | Accepted: a test reads the page and checks every named file exists. |
| 4 | Suggestion | Sitemap entries hard-coded apart from the folder. | Accepted: `PUBLISHED_DOC_SLUGS`, held to the folder by a test. |

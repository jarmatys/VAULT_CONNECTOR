# Plan review: panel-uses-notion-theme

Verdict: approve.

- Warning: the scoped preflight leaves the app's own screens without a reset unless their roots carry `data-slot`.
  Accepted: the panel content column and the landing `main` carry it; `DESIGN.md` says so.
- Warning: VC-7's folder screen still uses Flat Paint look maps. Accepted: whichever merges second converts it; this
  plan touches only shared files at the level of the theme and the layout.
- Suggestion: keep the amber accent as an override. Rejected: forks the theme and breaks its one-primary rule.

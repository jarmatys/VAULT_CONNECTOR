# Implementation review: panel-uses-notion-theme

Verdict: approve.

- Fixed in review: the consent links on the auth pages used `text-accent`, which is the Notion hover grey, so they were
  nearly invisible; now `text-link`. Flat Paint utilities left in the register page and the GitHub notice
  (`text-body-sm`, `text-muted`) replaced by `text-small text-muted-foreground`. The builder's credit in the footer had
  the browser's default link blue; now muted and underlined.
- Checked: no import of `@softure-ai/theme-flat-paint` or `theme-kit` remains (guard test); the landing e2e reads the
  Notion `primary`, `background` and `foreground` from `NOTION_THEME`, not literals.
- Workers e2e not run locally (same CSS and components as the Node run); CI runs it.

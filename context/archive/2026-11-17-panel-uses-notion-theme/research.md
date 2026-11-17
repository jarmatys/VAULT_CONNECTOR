# Research: panel-uses-notion-theme

## Today
- `src/app/globals.css` imports `@softure-ai/ui/styles.css`, Tailwind and Flat Paint's four sheets, then `brand.css`
  (amber over Flat Paint's lime, held by `src/theme/brand-theme.test.ts`).
- Screens pass Flat Paint look maps to `@softure-ai/ui` parts (`BUTTON_VARIANT_LOOK`, `CARD_TITLE_LOOK`,
  `CARD_STEP_LOOK`, `CHECKBOX_LOOK`, `FIELD_LABEL_LOOK`, `THEME_SWITCH_LOOK`) in the landing, the panel layout, the panel
  and the source screen. `e2e/landing.spec.ts` asserts the amber colours.
- VC-7 (open PR) adds `src/app/(panel)/panel/folders/page.tsx` on the same look maps.

## The kit
- `@softure-ai/theme-notion` 0.22.0 on npm (SOFTURE/AI `themes/theme-notion`): shadcn/ui parts with the Notion deltas,
  `PageHeader`, `Status`, `Sidebar*`, `PageFrame`; `sft-bridge.css` points `@softure-ai/ui`'s `--sft-*` tokens at the
  Notion tokens on every scheme scope, so package pages take the theme without look maps.
- The trip planner (and the assistant) wire it the same way: `@softure-ai/ui/styles.css` imported first in the root
  layout; `globals.css` = Tailwind theme, the theme's scoped `preflight.css`, Tailwind utilities, `theme.css`,
  `sft-bridge.css`, `base.css`, `page.css`; package pages inside `PageFrame`; the app shell from `SidebarProvider`,
  `Sidebar`, `SidebarMenuButton` with lucide icons; a guard test over `globals.css`.
- No gap in the theme was found for this change.

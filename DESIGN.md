---
name: VaultConnector
description: A quiet Notion-style workspace for reaching your notes from anywhere. Lots of white, warm graphite, colour only where it means something.
status: active
base: "@softure-ai/theme-notion"
---

# Design system: VaultConnector

The whole app (landing, panel, the package pages) is drawn in the Notion style of the SOFTURE kit (owner, 2026-11-17):
[`@softure-ai/theme-notion`](https://github.com/SOFTURE/AI/tree/master/themes/theme-notion) on shadcn/ui, the same
package and the same way of wiring it as the owner's other apps on the kit. The package is the source of truth for
tokens, components and rules; its README is the reference every screen reads first. This file keeps only what is
VaultConnector's own: how the product applies the kit and what its colours mean.

## The kit, in short

- **Tokens and parts come only from the theme.** Screens import components from `@softure-ai/theme-notion` (`Button`,
  `Card`, `PageHeader`, `Status`, `Checkbox`, `FoldRow`, `Steps`, `Sidebar*`…) and use its utilities (`bg-background`,
  `text-foreground`, `text-muted-foreground`, `text-page-title`, `text-heading-1..3`, `text-body`, `text-ui`,
  `text-small`, `text-section-label`, `max-w-content-width`, `shadow-card`…). No raw colour, no magic size, no CSS
  module, no other theme (`src/app/theme-package.test.ts` fails on them). A missing part or token is added to the theme
  in SOFTURE/AI directly (owner, 2026-11-16), never patched here.
- **The rules** (the theme README, "Rules, in short"): background `background`, text `foreground` (warm graphite, never
  black); hover is the grey `accent` background; one `primary` (blue) action per screen, the rest `secondary`,
  `outline` or `ghost`; borders are quiet, floating things use shadows; lucide icons at `ICON_STROKE_WIDTH`, no emoji;
  a status always carries a word and an icon.
- **`@softure-ai/ui` parts and package pages** (sign-in, registration, password, the legal documents, the waitlist form,
  the theme switch, the log-out button) take the theme through the package's `sft-bridge.css`: they are used as they
  are, with no look classes passed in. The auth pages sit in the theme's `PageFrame` (`src/app/(auth)/layout.tsx`).
- **Wiring:** `src/app/layout.tsx` imports `@softure-ai/ui/styles.css` first, then `src/app/globals.css`, which holds
  only the theme's imports in the README's order for an app with package pages (scoped preflight). Because the
  preflight is scoped, every screen root of the app's own carries `data-slot` (the panel's content column, the landing
  `main`); shadcn parts carry it already.
- **Dark scheme:** light by default, dark by the system setting; `@softure-ai/ui`'s `ThemeSwitch` sets `data-theme`.
  Nothing app-side is scheme-specific.

## How VaultConnector maps meanings to the palette

| Palette colour | Meaning in VaultConnector |
| --- | --- |
| `green` | a source that is connected, a sync or an index run that succeeded, a folder that is shared |
| `red` | a source GitHub took away, a failed sync, an error the person has to act on |
| `orange` | work waiting: a sync behind, an index not yet built, a limit close |
| `blue` | information, work in progress (indexing, syncing) |
| `gray` | not shared, not configured, switched off |

The theme's `primary` blue is the one action per screen; the product has no brand accent of its own (the amber of the
first draft is gone with Flat Paint). Never Obsidian's purple (trademark distance), and no vault, lock or padlock
clichés as decoration.

## Surfaces

- **Panel** (`src/app/(panel)/layout.tsx`): the theme's app shell. The `Sidebar` on the left (240 px) with the product's
  name, the sections from `src/components/panel/panel-sections.ts` (each with a lucide icon, the current one marked)
  and, at its foot, the signed-in account, log out and the theme switch; on a phone a bar with the menu button opens
  it as a sheet. Each screen sits in the `content-width` column (708 px), opens with `PageHeader` (title, description)
  and puts its work in `Card`s (`CardHeader`/`CardTitle` at `text-heading-3`, `CardContent`, `CardFooter` with the
  one primary `Button`). States read as `Status` (word and icon). A new panel screen adds its row to
  `panel-sections.ts` and its label to `en.panelShell.sections`.
- **Folder picker** (`src/app/(panel)/panel/folders/page.tsx`): the tree as rows at `row-height`, each a label with the theme's
  `Checkbox`, a folder icon, the name and the note count in `text-small text-muted-foreground`; subfolders indented.
- **Overview, the guided setup** (VC-12, `src/components/panel/Onboarding.tsx`): the five steps as `Steps` in its
  `list` layout inside a `Card` (each step's state also a word for assistive technology), then a numbered `Card` for
  every open step, its number box coloured like the list's badge. Only the step to do now carries the primary action. The
  connector URL is a `CodeBlock` next to the kit's `CopyButton` (the URL stays selectable when the browser refuses the
  clipboard); the index's share is a `MiniProgress` with the count as its label. While the index fills the page reads
  itself again every three seconds (`PanelRefresher`), so nothing asks the person to reload.
- **Later panel screens** (VC-8 onwards): progress is `Progress` or `MiniProgress`, an item's details `FoldRow` with
  `DetailTable`, a run history `Timeline`, onboarding `Steps`, states `Status`.
- **Landing:** one `content-width` column, the promise as `text-page-title`, the waitlist in a `Card`, the five pains as
  a list (the pain muted, the answer in `font-medium`, a quiet `border-border` rule on the left), the source link as the
  primary button. Copy in `src/messages/en.ts` (`landing`).
- **Package pages:** the module's own layout inside `PageFrame`; the app adds only text (consent links in `text-link`).

## Identity

- **Creative north star: "A lamp in the archive."** Calm, legible, precise. The product holds people's private notes,
  so nothing on screen shouts, sells or animates for its own sake.
- **Tone of copy:** plain English, short sentences, concrete promises ("only the folders you pick", "read-only").
  Privacy is stated as fact, not as fear.
- **Footer:** "<!-- language: pl -->Built by Jarosław Armatys<!-- /language -->" linking to armatys.me, and a link to the source code (AGPL section 13).

## Open

- Logo and favicon (the sidebar shows a "V" mark in the meantime).

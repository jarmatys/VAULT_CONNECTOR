---
name: VaultConnector
description: A quiet, flat instrument for reaching your notes from anywhere. Two schemes, one accent, nothing that glows.
status: draft
base: "@softure-ai/theme-flat-paint"
---

# Design system: VaultConnector

> **Status: draft.** The grammar and the accent values are fixed and held by tests (`src/theme/brand-theme.test.ts`,
> `e2e/landing.spec.ts`); a later design pass finishes the rest with the `impeccable` skill.

## Base

The tokens come from `@softure-ai/theme-flat-paint`: flat material with no light, shadow, glass or gradient, a dark
and a light scheme, one accent, Ubuntu for text and Ubuntu Mono for figures and code, a fixed type scale, spacing,
radii and the look maps of the `@softure-ai/ui` components. Screens use its roles (`background`, `surface`, `border`,
`foreground`, `muted`, `accent`, `accent-fill`, `on-accent`), never raw colours or sizes. A missing token or component
is added to the theme in SOFTURE/AI directly (owner, 2026-11-16), not patched locally.

## Identity

Same grammar as the base, its own character: notes, knowledge, trust and privacy.

- **Creative north star: "A lamp in the archive."** Calm, legible, precise. The product holds people's private notes,
  so nothing on screen shouts, sells or animates for its own sake.
- **Accent: warm amber**, the light you read by, instead of the base's lime. It is laid on flat like paint: the primary
  button, an active tab, a shared folder's mark. Values: fill `#f2b84b` (hover `#e5a832`) with near-black text
  `#0c0c0d` in both schemes; accent text and focus `#8a5a00` on light, `#f2b84b` on dark. All meet the base's rules
  (4.5:1 for text, 3:1 for focus and control boundaries), measured by the unit test.
- **How the accent is applied:** `src/theme/brand-theme.ts` extends Flat Paint (`extendTheme`) with these values, and
  `src/app/brand.css` declares the same values as CSS variables after the theme's stylesheets, in the theme's own
  three scheme selectors (the theme kit's "Overriding in an app"). The base's palette names (`lime`, `lime-hover`,
  `lime-deep`) carry the amber values too, because the base's look maps and page styles paint with them, and so does
  the selected-row bar. The theme needed no change.
- **Never Obsidian's purple** (trademark distance), and no vault, lock or padlock clichés as decoration.
- **Tone of copy:** plain English, short sentences, concrete promises ("only the folders you pick", "read-only").
  Privacy is stated as fact, not as fear.
- **Footer:** "<!-- language: pl -->Built by Jarosław Armatys<!-- /language -->" linking to armatys.me, and a link to the source code (AGPL section 13).

## Surfaces

- **Landing (gate 0):** the promise, the waitlist for the hosted version in one surface card, the five pains as a list
  (the pain muted, the answer in strong text, an amber rule on the left), the source link as the primary amber button.
  Copy in `src/messages/en.ts` (`landing`).
- **Panel:** two-minute onboarding (connect a vault source, pick folders, add the connector to Claude), the list of
  shared folders, index status, account and payment.

## Open

- Logo and favicon.
- Fonts: Ubuntu and Ubuntu Mono are named by the theme but not loaded yet (the system fallback renders until the
  design pass loads them with `next/font`, which fetches them at build time).

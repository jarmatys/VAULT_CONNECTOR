---
name: VaultConnector
description: A quiet, flat instrument for reaching your notes from anywhere. Two schemes, one accent, nothing that glows.
status: draft
base: "@softure-ai/theme-flat-paint"
---

# Design system: VaultConnector

> **Status: draft.** The grammar is fixed; the accent values are a proposal, finished with the `impeccable` skill in
> the landing-page change and held by tests from then on.

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
  button, an active tab, a shared folder's mark. Proposed values: fill `#f2b84b` with near-black text in both schemes;
  accent text and focus `#8a5a00` on light, `#f2b84b` on dark. Contrast must meet the base's rules (4.5:1 for text,
  3:1 for focus and control boundaries) before the values are final.
- **Never Obsidian's purple** (trademark distance), and no vault, lock or padlock clichés as decoration.
- **Tone of copy:** plain English, short sentences, concrete promises ("only the folders you pick", "read-only").
  Privacy is stated as fact, not as fear.
- **Footer:** "<!-- language: pl -->Built by Jarosław Armatys<!-- /language -->" linking to armatys.me, and a link to the source code (AGPL section 13).

## Surfaces

- **Landing (gate 0):** the promise, the five pains and how each is answered, a link to GitHub, the waitlist for the
  hosted version.
- **Panel:** two-minute onboarding (connect a vault source, pick folders, add the connector to Claude), the list of
  shared folders, index status, account and payment.

## Open

- Logo and favicon.
- Whether the theme accepts an app accent through configuration (if it does not, the theme is extended in SOFTURE/AI; roadmap item VC-1).

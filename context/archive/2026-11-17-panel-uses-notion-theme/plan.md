# Plan: panel-uses-notion-theme

## Approach
Swap Flat Paint for the Notion theme in one pass, copying the trip planner's wiring; drop the amber accent (the theme's
blue `primary` is the one action colour); rebuild the panel frame as the theme's app shell; replace every look map with
Notion parts; rewrite `DESIGN.md` for the items that follow.

## Decisions (auto)
- No brand accent: Notion's rule is one blue primary and palette colours for meaning only; an amber override would
  fork the theme. `DESIGN.md` records the product's meaning-to-colour table instead.
- Scoped preflight (package pages keep `@softure-ai/ui`'s base), so the app's own screen roots carry `data-slot`.
- `@softure-ai/ui` parts (waitlist, theme switch, log out) stay as they are and take the theme through the bridge.
- Panel sections in one list (`panel-sections.ts`) with a pure `findCurrentSection`, unit-tested.

## Phases
1. Dependencies and wiring: remove `@softure-ai/theme-flat-paint` and `@softure-ai/theme-kit`, add
   `@softure-ai/theme-notion` and `lucide-react`; new `globals.css`; root layout imports; delete `brand.css` and
   `src/theme/`. Test: `src/app/theme-package.test.ts` (import order, no own rules, no raw colour, no other theme).
2. Screens: panel shell (sidebar, phone sheet), overview and source screens on `PageHeader`/`Card`/`Button`/`Status`,
   landing on `Card`/`Button`, auth pages in `PageFrame`, links in `text-link`. Test: `panel-sections.test.ts`,
   `e2e/landing.spec.ts` asserts the Notion colours in both schemes.
3. `DESIGN.md` and evidence.

Done when: typecheck, lint, unit and both e2e suites green; screenshots of the panel in both schemes and on a phone.

## Progress
- [x] Phase 1: wiring. `npm run typecheck`, `npm run lint` green; `theme-package.test.ts` 7/7.
- [x] Phase 2: screens. `npm test` 111/111 (+ new files), `npx playwright test` 28/28 on `next start` (local Postgres 16).
- [x] Phase 3: `DESIGN.md` rewritten. Evidence: project files
      `vault-connector/evidence/panel-uses-notion-theme/01..05` (panel light and dark, source, phone menu, landing).

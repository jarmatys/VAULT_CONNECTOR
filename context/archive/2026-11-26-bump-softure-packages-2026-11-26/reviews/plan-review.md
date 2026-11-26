# Plan review: bump-softure-packages-2026-11-26

Checked plan.md against change.md, each package's CHANGELOG between the versions crossed, and the code.

- `TokenManager` is the only changed component the app renders (`src/app/(panel)/panel/connectors/page.tsx`); it
  passes no `messages`, so the new copy keys come from the package. Correct.
- `grep` for `InvitationPanel`, `FoldRow`, `TabBar`, `onOpenAutoFocus`, `data-color`: no hit in `src/`, so no other
  migration applies. Correct.
- The only browser test that clicks Revoke or Disconnect on the token page is `e2e/connector.spec.ts` (the source
  specs' Disconnect is the app's own button). Covered.

Verdict: approve, no findings.

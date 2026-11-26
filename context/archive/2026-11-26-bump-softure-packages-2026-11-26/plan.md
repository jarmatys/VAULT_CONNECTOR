# Plan: bump-softure-packages-2026-11-26

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| auth | 0.2.23 → 0.2.24 | `InvitationPanel` confirms Revoke in a dialog; the app does not render `InvitationPanel`, so nothing changes |
| mcp-access | 0.7.8 → 0.7.9 | `TokenManager`'s Revoke and Disconnect open a confirmation dialog; the app uses the package's English messages, so no copy keys to add; the e2e spec that clicks Disconnect confirms in the dialog next |
| theme-notion | 0.31.0 → 0.35.0 | `FoldRow` inset and status column, `TabBar` scrolls itself, dialogs focus their first field, new `ListEntry`, `ResultBadge`, `RowActionsMenu`, `Badge` `data-color`; the app has no own override any migration line names, so nothing changes |
| testing | 0.5.2 → 0.6.0 | opt-in `dom: true` happy-dom project and `renderWithUser`; additive, nothing changes |

## Phases

### Phase 1: versions and the connector e2e spec

- `package.json`, `package-lock.json`, `e2e/connector.spec.ts`, this folder.
- Test: `e2e/connector.spec.ts` "an assistant registers … loses access when disconnected" clicks Disconnect and then
  confirms in the dialog; without the confirm the grant stays and the "No app is connected." text never shows (red on
  mcp-access 0.7.9, seen in the pull request's e2e job or locally).
- Done when: typecheck, lint and the unit suite are green locally, `npx softure-skills doctor` exits 0, and the pull
  request's checks (e2e on both hosts included) are green.

## Progress

- [x] Phase 1: bump and the e2e confirm. Locally: typecheck 0, lint 0, `npx softure-skills doctor` OK, unit suite 68
  files / 651 tests green. The connector spec's confirm step is proved by the pull request's e2e jobs (the stack
  needs a browser and the full app); without it the grant stays after the first click, since 0.7.9 only opens the
  dialog.

## Decisions (auto)

- The connector spec confirms inside the dialog by role (`dialog` → button "Disconnect", exact), so it does not match
  the row's trigger, whose accessible name carries the app's name.

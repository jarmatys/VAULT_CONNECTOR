# Plan: bump-softure-packages-2026-11-28

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| mcp-access | 0.7.9 → 0.7.10 | `McpServerIdentity` gains optional `via` and `clientName`; an app that records who ordered a write may read them. The app's MCP tools are read-only and record no caller, and it never calls `findTokenClientName`, so nothing changes |
| theme-notion | 0.41.1 → 0.42.0 | new `TableSortHead`, `sortRows`, `TableViewSettings`; additive, the app has no own sortable header or column menu to replace, so nothing changes |

## Phases

### Phase 1: versions

- `package.json`, `package-lock.json`, this folder.
- Test: no project code changes, so no new test; the existing suite covers the MCP server factory typed on
  `McpServerIdentity` and every themed screen.
- Done when: typecheck, lint and the unit suite are green locally, `npx softure-skills doctor` exits 0, and the pull
  request's checks are green.

## Progress

- [x] Phase 1: bump. Locally: typecheck 0, lint 0, unit suite 68 files / 651 tests green, `npx softure-skills doctor` OK.

## Decisions (auto)

- The optional `clientName` is not adopted: the app has no write path that records its caller, so adopting it would
  add code with no behaviour.

---
change_id: text-helpers-move-to-packages
title: "Accent folding and the untrusted-text markers come from the SOFTURE packages"
status: archived
archived_at: 2026-11-18
roadmap_item: null
issue: null
branch: claude/project-thread-83sm99
created: 2026-11-18
updated: 2026-11-18
---

## Intent

The last two generic helpers in the app move to the packages other apps already use: the accent folding behind keyword
search (`foldWords`, core 0.2.11; other apps carry their own copies of the same fold) and the marker wrapper that keeps
note text as data in MCP answers (`createUntrustedWrapper`, mcp-access 0.7.7; every MCP server that returns user text
needs it). The app keeps only its binding: its own marker copy and the tsquery built from the folded words.

## Notes

Research and frame skipped: a move of code that already runs here, with its tests, into the package; the fold is byte
for byte the same, so the stored search text of indexed passages stays valid without a re-index.

A final audit of the rest of `src/` found nothing else to extract: what remains is the product itself (vault sources
and their sync, passage splitting, the hybrid search over the app's own tables, the table of contents, the MCP tools,
folder rules, plans and limits, onboarding and panel screens).

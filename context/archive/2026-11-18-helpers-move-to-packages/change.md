---
change_id: helpers-move-to-packages
title: "Three local helpers move to the SOFTURE packages; theme-notion 0.28; stale planning notes refreshed"
status: archived
archived_at: 2026-11-18
roadmap_item: null
issue: null
branch: claude/project-thread-l68u38
created: 2026-11-18
updated: 2026-11-18
---

## Intent

After the hosted-product roadmap closed, check that nothing is left open and move what any app would need into the
shared packages, so this repository keeps only what is specific to the product.

## Scope

- The fake S3 bucket of the tests and the end-to-end fakes → `createFakeS3` of `@softure-ai/files/testing` (0.5.3).
- The client-IP resolver chosen by `CLIENT_IP_SOURCE` → `clientIpFromEnv` of `@softure-ai/security` (0.2.11).
- The funnel per day of `npm run funnel` → `getFunnelDays` and `formatFunnelDays` of `@softure-ai/analytics/server`
  (0.3.6), now one query instead of one report per day.
- `@softure-ai/theme-notion` ^0.25.0 → ^0.28.0 (additive: DetailTable fixed layout, ListGroup, SortableHandle reveal).
- PRD v3: OQ-3 recorded as answered; `docs/planning-context.md` brought up to date (embeddings settled, package
  versions, where the production secrets are listed).

## Notes

Research skipped: an audit, not a new behaviour; the findings are the scope above. Frame skipped for the same reason.
Checked and left here as product-specific: the Dropbox, GitHub and headless-sync source clients and their fakes (only
a vault source reads those APIs), the note splitter and hybrid search (tied to the vault's passages table), the admin
guard (a lazy import specific to this config's Node loads).

The audit found nothing else open: no open pull requests or issues, no branch but `master`, no TODO or FIXME in the
code, every change folder archived, the roadmap archived. `context/backlog/measured-gaps.md` holds the four
measurements that can only run on the hosted instance after the first release.

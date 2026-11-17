# Plan review: app-runs-on-both-hosts

Verdict: approve.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | A host-specific shortcut here leaks into every item (roadmap risk). Check: the only host switch is `readHost` in `src/settings.ts`, read by `softure.config.ts` and `next.config.ts`; app code imports no host-specific entry except the generated-shape `worker.ts`. | Accepted as planned. |
| 2 | Warning | The PGlite alias in `wrangler.jsonc` is a local workaround for a gap any standalone app meets. | Keep locally; the generic fix goes with VC-4's `init --host=cloudflare` (recorded in the plan's decisions and reported to the coordinator). |
| 3 | Suggestion | Overriding palette names (`lime*`) with amber reads oddly. | Accepted: the base's look maps paint with them; documented in DESIGN.md and `brand-theme.ts`. |
| 4 | Suggestion | `pgvector` is not exercised by any test yet. | Accepted: VC-1 has no vector schema; the CI image is ready for VC-10. |

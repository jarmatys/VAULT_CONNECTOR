# Measured gaps

Lines from the VC-23 recorded run (`docs/measurements.md`). Every target was met on fakes; these are what the run could
not show.

- [ ] 2026-11-18 hosted-product-end-to-end-check: re-run the measured goals on the hosted instance after the first release (Workers, Neon through Hyperdrive, R2): onboarding, tool p95 and sync delay measured on fakes and PGlite only (major) docs/measurements.md
- [ ] 2026-11-18 hosted-product-end-to-end-check: `search_vault` p95 with a real embedding model (Workers AI bge-m3) on 5,000 notes; the run used the fake model, so the embedding call per search is not in the number; needs the owner's yes for the paid calls (minor) scripts/measure/tool-speed.measure.ts
- [ ] 2026-11-18 hosted-product-end-to-end-check: time sign-up to first answer with a real Claude client adding the connector (the run drives the panel and the MCP calls, not claude.ai) (minor) e2e/onboarding.spec.ts
- [ ] 2026-11-18 hosted-product-end-to-end-check: measure the push-to-visible delay from a real GitHub App webhook delivery (the run enqueues the webhook sync directly) (minor) scripts/measure/sync-delay.measure.ts

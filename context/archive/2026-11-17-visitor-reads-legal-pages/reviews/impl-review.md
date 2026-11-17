# Implementation review: visitor-reads-legal-pages

Verdict: approve.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The policy names Cloudflare and Neon as processors and the EU as the place, before the deploy (VC-4) exists. | Accepted: both follow the hosting decision in `docs/planning-context.md`; VC-4 changes the text with a history entry if the deploy differs. |
| 2 | Warning | Two lines are placeholders: where embeddings run (VC-10) and the mail and payment providers (VC-5, VC-15). | Accepted by design (roadmap unknowns); each item that settles one replaces its line and adds a history entry in `src/lib/legal-documents.ts`. |
| 3 | Suggestion | The footer's list separator rendered with uneven spacing. | Fixed: the list form without a separator. |
| 4 | Suggestion | The privacy module is not registered yet, so no consent records a version. | Accepted: VC-5 registers `privacy({ documents: LEGAL_DOCUMENTS })` with auth. |

Evidence (project files, `vault-connector/evidence/visitor-reads-legal-pages/`): `01-privacy-policy-after-1280-light.webp`,
`02-privacy-policy-after-390-dark.webp`, `03-home-footer-after-1280-light.webp`.

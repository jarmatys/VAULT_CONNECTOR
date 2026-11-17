# Implementation review: visitor-joins-waitlist (VC-2)

Reviewed the diff against plan.md, change.md and the PRD (FR-1, FR-3, G-1). Auto mode.

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | Warning | `security({ clientIp: cloudflareIp() })` refuses every sign-up of a self-hosted instance without Cloudflare in front (`client_unidentified`). | Kept: the hosted version sits behind Cloudflare and the e2e covers it; VC-18 (self-host with compose) chooses the resolver for its stack. Noted in the config comment and below. |
| 2 | Suggestion | `submitFullWidth={false}` had no effect next to the theme's button look. | Fixed: prop removed. |
| 3 | Suggestion | The test of the funnel endpoint first checked only the status. | Fixed: it now asserts that no count exists for the channel, and was seen red when the step was a pixel step. |
| 4 | Suggestion | The test provider is imported from `@softure-ai/mailing/testing` into the app bundle. | Kept, as in the reference app: it never sends a real mail and refuses without an outbox; Resend replaces it once `RESEND_API_KEY` is set. |

No drift from the plan: the deferral of the agent-ready documents to VC-17 and of the `signup` count to VC-5 were
decided in the plan. Progress items carry their evidence.

Verdict: ready to archive.

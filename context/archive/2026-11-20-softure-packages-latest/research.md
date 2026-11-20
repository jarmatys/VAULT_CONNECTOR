# Research: softure-packages-latest

What each newer version asks of an app (the packages' CHANGELOG "Migrate" lines):

| Package | From → to | Migrate |
| --- | --- | --- |
| auth | 0.2.18 → 0.2.19 | nothing (first provider sign-in clears an unverified password) |
| backup | 0.1.2 → 0.1.3 | copy the example's failure reporting into `backup-verify.yml` (optional) |
| files | 0.5.3 → 0.6.1 | nothing (`setFileExpiry` added, `maxOpenPerOwner` 20) |
| jobs | 0.1.11 → 0.1.14 | nothing (lease heartbeats in `runDueJobs`, hook time limits, `last_error` codes only) |
| mcp-access | 0.7.7 → 0.7.8 | add `buildOAuthConsentHeaders()` to `next.config` headers when OAuth is on |
| observability | 0.8.7 → 0.8.8 | nothing (host metrics, Next request metric) |
| security | 0.2.11 → 0.2.12 | nothing; `eventTime` optional for providers whose events carry a creation time |
| config | 0.1.6 → 0.1.7 | nothing |
| deploy (pins) | 0.7.3 → 0.7.8 | bump the pins; 0.7.7 adds failure issues to the Cloudflare `backup-verify.yml`; 0.7.4–0.7.6 are opt-in inputs of the VPS reusable workflows this app does not call |

The `deploy-cloudflare` and `backup-cloudflare` actions and `deploy-cut-release.yml` did not change between the
two tags; `deploy-report.yml` only moved its default CLI version.

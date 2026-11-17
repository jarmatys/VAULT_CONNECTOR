# Implementation review: claude-searches-picked-notes

Verdict: ready to merge. Reviewed at 9839ec0 against plan.md.

| # | Finding | Severity | Decision |
| --- | --- | --- | --- |
| 1 | In hybrid and meaning mode with a model, the vector ranking orders every passage in scope, so a search rarely ends with "no results": weak passages fill the tail. The words ranking still leads the fused order. | Suggestion | Accepted as is: the prototype behaves the same; a distance threshold needs the real model's measurements (`npm run index:hit-rate`) and is left to tuning. |
| 2 | Each search reserves under metering's provider-wide advisory lock, so searches of all accounts serialise for a few milliseconds. | Suggestion | Follow-up: a per-account lock when only per-account budgets apply is a generic metering improvement; not needed at launch volume. |
| 3 | `getIndexProgress` runs on every search for the "still indexing" note. | Suggestion | Kept: three counts on the account's rows, inside the measured budget. |
| 4 | Search query text reaches the embedding provider; the privacy policy named only note passages. | Warning | Fixed: the policy's unreleased 2026-11-18 text and history entry now name search queries too. |
| 5 | Plan drift: none. The allowance lives in metering (no app migration), the tool list version changes by itself, e2e lists the new tool. | — | — |

Evidence: typecheck and lint green; unit suite 44 files, 347 tests green; MCP endpoint tests cover ranking with path and
score inside the markers, folder narrowing and refusal, empty results with the query echoed, max_results, the allowance
refusal with the reset date while get_note and vault_index keep working, per-account and per-month allowance, and
isolation probes for search; 5,000-note hybrid search p95 76 ms (median 56 ms) on PGlite against the 3 s target.

---
change_id: account-connects-git-source
verdict: approved
---

# Implementation review

Reviewed the branch against plan.md, the plan review and the roadmap item (VC-6).

1. **Fixed, security (rate limit):** the source screen re-checked the installation with GitHub on every view: three
   calls on the App's limit, which every account shares, so one person reloading could spend it for everyone. A check
   now runs at most once a minute per source (`isSourceCheckDue`, `SOURCE_CHECK_INTERVAL_MS`, unit-tested at the
   boundary); the e2e moves `checked_at` back instead of waiting.
2. **Fixed, flaky e2e:** routing the browser's visit to GitHub's install page with `page.route` failed about one run in
   twelve (a redirect hop the browser does not hand to the route). The link flow now takes the browser-facing GitHub
   origin from its context (`webOrigin`); with the loopback-only `GH_AUTH_FAKE_ORIGIN` set, the browser goes straight
   to the fake, which knows the person by a cookie on its own origin. 16 of 16 repeated runs green.
3. **Fixed, package types:** the `github-app` calls declared `Result<T, code>`, which hid the failure's `status` and
   `retryAfterSeconds`; `GithubAppResult<T>` in `@softure-ai/connections` 0.5.0 now carries them. The fake App takes
   `privateKey`, so the e2e app and the fake share a key made per run (no key is committed).
4. **Plan drift, accepted:** the setup and callback routes live at `/panel/source/github/{setup,callback}` instead of
   `api/vault/...`: under the panel prefix the proxy and `requireUser` guard them, and the session cookie (SameSite
   Lax) arrives on GitHub's top-level redirect. Docs and the owner step name these paths.
5. **Checked, security:** an installation id from the setup redirect is only a claim; the callback requires the user's
   own token to reach it (`listGithubUserInstallationRepositories`), so a forged id ends `vault.link_not_yours`. States
   are stored as sha256, bound to the account, ten minutes, set up once and consumed once; the PKCE verifier never
   leaves the server. The `?error=` code is whitelisted before it reaches the screen. Redirects go only to the app's
   own paths or the authorize URL the app built. Disconnect deletes only the signed-in account's row.
6. **Checked, tests:** unit tests for the settings, the GitHub adapter (tree, read, changes, full resync, truncation,
   every error code) and the link flow on PGlite (happy path, forged installation, foreign and replayed or expired
   state, a callback without setup, more than one repository, write access, declined authorization, pending approval,
   check: connected, uninstalled, repository removed, outage keeps status, throttle). E2E on Node: connect, panel names
   the repository, uninstall shows disconnected, reconnect offered, disconnect; two repositories refused with the
   reason. Full Node e2e 28 of 28 and unit suite 85 of 85 locally; workerd runs in CI.
7. **Suggestion, not taken:** an operator view of all sources; nothing in the PRD needs it before VC-16.

Verdict: approved.

---
change_id: account-signs-up-to-panel
verdict: approved
---

# Implementation review

Reviewed the branch against plan.md, the plan review and the PRD (FR-4, FR-5).

1. **Fixed, correctness:** `proxy.ts` sat at the repository root while the app directory is `src/app`. Next ignores a
   proxy in that place, so the panel was guarded only by `requireUser` in the layout (the Node e2e still passed) and the
   OpenNext build failed. Moved to `src/proxy.ts`, with a unit test that holds its place and its redirect.
2. **Checked, plan drift:** none beyond the proxy path. The decisions in plan.md hold: one GitHub App for sign-in and
   the source, `openSignUp`, consent on the password form and a terms notice next to GitHub, panel at `/panel`.
3. **Checked, security:** the fake GitHub origin is read only for a loopback http(s) origin without credentials
   (`toLoopbackOrigin`, unit-tested); the client secret is read by auth from the environment and never logged; rate
   limits stay on the auth buckets keyed by `CF-Connecting-IP`, and the shared fallback is opt-in.
4. **Checked, tests:** unit tests for the settings, the fetch seam and the proxy; e2e for registration, logout and
   login, a wrong password, the guard, GitHub sign-up and sign-in (one account, two sign-ins), an unverified GitHub
   address refused, password reset through the mailed link, and closed registration (serial, reset in `afterAll`).
   Every spec deletes the accounts it created.
5. **Suggestion, not taken:** a switches screen for the operator; the env override and the stored value are enough
   until the admin surface exists.

Verdict: approved.

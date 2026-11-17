---
change_id: account-signs-up-to-panel
verdict: approved_with_changes
---

# Plan review

Reviewed plan.md against change.md, research.md, the PRD (FR-4, FR-5) and master (e7ba9d1).

1. **Warning, scope:** FR-4 asks that a GitHub sign-in "creates an account or signs in the existing one". With the
   allowlist rule of auth 0.2.16 no public sign-up is possible. Covered by the SOFTURE/AI fix; the plan must not merge
   before auth 0.2.17 is on npm. Accepted: phase 1 pins `^0.2.17`.
2. **Warning, contract with VC-6:** the roadmap names `src/app/(panel)/source/**` for VC-6. With the panel at `/panel`
   that path would be `/source`, outside the guard prefix. Fix: record in the archived change.md that panel screens
   live under `src/app/(panel)/panel/**`. Accepted.
3. **Suggestion, parallel items:** VC-2 (landing) and VC-3 (legal) also add to `softure.config.ts` and
   `messages/en.ts`; keep additions in their own blocks so merges stay additive. Accepted.
4. **Test gap check:** guard redirect for a visitor without a session is in phase 3; closed registration is a serial
   spec that resets the stored switch in `afterAll`. Unit tests cover the settings and the fake-origin seam refusal of
   a non-loopback origin.
5. **Security:** the fake seam must be impossible to turn on in production by accident: loopback only, and the value is
   never logged. Accepted.

Verdict: approved with the changes above applied.

# Plan review: bump-softure-packages-2026-11-24-2

- jobs 0.1.15 changes `runScheduleNow` only; the app does not call it or read the dedup key (grep): OK.
- The doctor pin is held by `scripts/deploy/release-workflows.test.ts`: OK.
- `ownerWordWake` is one of the doctor's allowed values: OK.

Verdict: proceed.

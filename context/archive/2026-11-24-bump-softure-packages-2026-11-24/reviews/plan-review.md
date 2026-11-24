# Plan review: bump-softure-packages-2026-11-24

- The breaking mailing/privacy change is covered end to end: Worker secrets, release `env:`/`secret-names`, the dry
  run's stand-ins, the self-hosted compose file, the e2e servers and the specs that compute consent keys: OK.
- The three SQL functions migration `0006` drops are not referenced anywhere in the repository (grep): OK.
- The deploy pin and the doctor pin are held by `scripts/deploy/release-workflows.test.ts`: OK.
- theme-notion's `PageLayout` migration does not apply (different wrapper): recorded as a decision, OK.

Verdict: proceed.

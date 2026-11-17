# Plan review: dependencies-to-latest

Verdict: approved. Checked: peer ranges of `typescript-eslint`, `eslint-config-next` and its plugins on npm; the
SOFTURE/AI pin is guarded by `scripts/deploy/release-workflows.test.ts`, which moves with it.

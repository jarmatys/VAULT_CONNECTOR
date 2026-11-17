# Plan review: worker-drops-import-meta-shim

Verdict: approved. Checked: `worker-runtime.ts` is imported only by `worker.ts`; the vault module's own
`resolveMigrationsDir` call is covered by the same core fix.

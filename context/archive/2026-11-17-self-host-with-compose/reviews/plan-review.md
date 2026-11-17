# Plan review: self-host-with-compose

Verdict: approve with two fixes applied to the plan.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The roles recipe's migrator cannot create `vector` (not a trusted extension); the vault migration would fail on a fresh volume. | Fixed in plan: a superuser init script creates both extensions before the roles recipe. |
| 2 | Warning | With `cloudflareIp()` a self-hoster without Cloudflare gets every rate-limited form refused. | Fixed in plan: `CLIENT_IP_SOURCE`, compose default `forwarded-for`. |
| 3 | Suggestion | The e2e suite needs the run's GitHub App key in both the runner and the container. | Accepted: `scripts/self-host/e2e-env.ts` writes the app's env file and the runner's key from `e2e/services.ts`. |
| 4 | Suggestion | The background worker may race the tests that seed the database. | Accepted as a measured risk: the stack runs the worker as in production; a flaky spec is fixed, not skipped. |

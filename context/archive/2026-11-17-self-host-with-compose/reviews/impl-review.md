# Implementation review: self-host-with-compose

Verdict: approve. Plan followed; one fix found by the local e2e run and applied before review.

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | `GET /api/health/build` answered `commit: null` from the image (no git in the build context); the e2e health spec failed on the stack. | Fixed: `SOFTURE_BUILD_COMMIT` build argument from compose; the e2e env script passes `git rev-parse HEAD`; the guide's update command sets it. |
| 2 | Suggestion | The image is built locally by every self-hoster; a published image (GHCR) would make updates a pull. | Deferred: publishing an image is an owner decision (registry, tags, signing); compose already reads `VAULTCONNECTOR_IMAGE`. |
| 3 | Suggestion | The worker runs during the e2e suite and could race specs that seed the database. | Measured: two full runs locally, 37/37 green with the worker syncing; no change. |
| 4 | Suggestion | `deploy.json` verify is not run against the stack. | Not needed: the e2e health specs cover the same routes on the stack. |

Checks: the plan's Done-when criteria hold. Least-privilege roles hold at run time (the app role ran the whole suite,
no DDL). No secret, address or personal value in the diff; test values are marked as such.

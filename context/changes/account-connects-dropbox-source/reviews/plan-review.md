# Plan review: account-connects-dropbox-source

| # | Severity | Finding | Decision |
| --- | --- | --- | --- |
| 1 | Warning | The OAuth callback must not accept a state started by another account or reused. | Accepted: the state is consumed by its sha256 and `user_id` in one `DELETE ... RETURNING`, ten-minute expiry, kind `dropbox` required (Phase 2 test). |
| 2 | Warning | "Read-only" rests on what the person grants on Dropbox, not only on what is asked. | Accepted: the token answer's `scope` is checked; any write scope refuses the link and revokes the token (Phase 2 test). |
| 3 | Warning | The refresh token is a long-lived secret. | Accepted: sealed with the vault keyring, bound to `vault/sources/<user id>/dropbox`, never logged or shown; revoked on disconnect (Phase 2 test that another account's row does not open it). |
| 4 | Warning | `path_display` keeps the case of the last component only: relative paths could change case between listings and churn copies. | Accepted: relative paths are rebuilt from folder entry names; test with mixed-case `path_display` (Phase 1). |
| 5 | Suggestion | A refresh call per sync step. | Accepted as is: one call every five minutes per connected account; noted in research. |
| 6 | Suggestion | Migration 0006 may collide with a parallel item. | Noted: whoever merges second renumbers. |
| 7 | Suggestion | `saveGithubSource` and `saveS3Source` must clear the Dropbox columns, and the constraints must keep each kind's columns exclusive. | Accepted: migration adds `sources_dropbox_fields` and widens the S3/GitHub-only checks; store tests switch kinds both ways. |

Verdict: approve with the fixes folded into the plan.

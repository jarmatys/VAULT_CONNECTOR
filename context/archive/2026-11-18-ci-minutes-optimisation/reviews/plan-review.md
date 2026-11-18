# Plan review: ci-minutes-optimisation

Verdict: approve, with two findings applied to the scope.

- Warning, applied: a `changes` job to skip e2e on documentation inside `checks.yml` would itself cost a billed minute
  on every run (~65 a week), eating most of #38's saving. Moving the e2e jobs into their own workflow with
  `paths-ignore` skips them for free.
- Warning, applied: dropping e2e on push leaves a merged result untested before a release; a nightly run costs ~11
  minutes a day whether or not anything is released. A call from `release.yml` tests the exact tag once per release.
- Checked: `content/**/*.md` feeds the app's docs pages and the e2e; the skip uses `*.md` (root only), not `**/*.md`.
- Checked: a reusable workflow called with `ref` checks out the tag on `release` and on "Run workflow" alike; on a pull
  request `inputs.ref` is empty and checkout uses the pull request's merge ref.

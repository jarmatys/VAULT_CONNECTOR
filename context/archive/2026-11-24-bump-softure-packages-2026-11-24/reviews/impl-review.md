# Implementation review: bump-softure-packages-2026-11-24

- Every place that lists the Worker's or the self-hosted instance's required secrets names `SOFTURE_EMAIL_KEY_SECRET`
  next to `MAILING_UNSUBSCRIBE_SECRET` (grep over the repository outside `context/archive/`): OK.
- The guards that hold those lists were seen red, then green; the account erase and export suites stub the secret the
  way they stub the storage key secret, and unstub it after each test: OK.
- The e2e specs derive consent keys with the same secret as the app under test (`getTestEmailKey`), so their cleanup
  removes the rows the app wrote: OK.
- No SOFTURE code changed, no test loosened, no hook skipped: OK.
- Plan drift: the account erase and export tests and the reviewer step in `docs/deployment.md` were found by the suite,
  not foreseen; recorded under Progress and Decisions: OK.

Verdict: approve.

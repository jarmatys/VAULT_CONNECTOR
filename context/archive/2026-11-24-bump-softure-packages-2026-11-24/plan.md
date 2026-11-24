# Plan: bump-softure-packages-2026-11-24

## Findings

| Package | From → to | Migrate |
| --- | --- | --- |
| mailing | 0.2.8 → 0.3.0 | breaking: recipient keys are PBKDF2 keyed by `SOFTURE_EMAIL_KEY_SECRET` (32+ chars); migration `0006` drops three SQL functions the app does not call; no production data yet, so nothing to re-key |
| privacy | 0.2.5 → 0.3.0 | breaking: the email subject key uses the same secret; `getEmailKey(email, env?)` |
| waitlist | 0.5.4 → 0.5.5 | needs the secret; requires mailing and privacy `^0.3.0` |
| alerts, auth, billing | 0.2.3 → 0.2.4, 0.2.21 → 0.2.23, 0.11.3 → 0.11.4 | peer range on mailing `^0.3.0`; auth 0.2.23 adds opt-in `LogoutButton` styling props |
| theme-notion | 0.30.0 → 0.31.0 | new `PageLayout`; the migration is for apps whose wrapper is exactly `grid w-full min-w-0 gap-4` + `PageHeader`; the panel's `<main className="grid gap-8">` is not that wrapper, so nothing changes |
| skills | 0.33.0 → 0.34.0 | the installer rewrites `.claude/` and the managed block; `softure-skills state`, `doctor` exit 0; the doctor pin in `checks.yml` follows |
| deploy (pins, transitive CLI) | 0.7.8 → 0.7.9 | pins to the `deploy@0.7.9` commit; add `publicPaths` to `deploy.json` (`["/"]` for a public app) |

## Phases

### Phase 1: versions, the email key secret and pins

- `package.json`, `package-lock.json`, `.claude/`, `AGENTS.md`, `context/state.json`, `.github/workflows/*.yml`,
  `wrangler.jsonc`, `docker-compose.yml`, `deploy.json`, `.env.example`, docs, `e2e/support.ts` and the two specs that
  read consents, the guard tests in `scripts/`, this folder.
- Tests: the guards that list the Worker's and the compose file's required secrets name `SOFTURE_EMAIL_KEY_SECRET`;
  `buildE2eStackEnv` must set it. Each is seen red before the config change.
- Done when: `npx softure-skills doctor` exits 0, typecheck, lint and the unit suite are green locally, and the pull
  request's checks (e2e on both hosts included) are green.

## Progress

- [x] Phase 1: bump, secret wiring, pins. Red before the fixes: `compose.test.ts` "sets every value both compose files
  require" (`['SOFTURE_EMAIL_KEY_SECRET']` missing), the doctor-pin guard in `release-workflows.test.ts`, and 9 tests
  of `account-deletion.test.ts` and `reviewer-account.test.ts` (`SoftureConfigError: SOFTURE_EMAIL_KEY_SECRET`:
  erasing or exporting an account keys its consents). Green after the test env, `checks.yml` and the suites' env
  stubs moved; doctor exit 0; typecheck 0, lint 0, unit suite 68 files / 651 tests green.

## Decisions (auto)

- `SOFTURE_EMAIL_KEY_SECRET` is required, not optional, on both hosts: without it a waitlist sign-up throws when it
  records the consent, so an instance without it would be broken, not degraded.
- No re-keying of stored rows: the product has not launched, so no production row carries an old SHA-256 key.
- Erasing and exporting an account need the secret too (privacy keys the account's address), so the operator's
  `npm run reviewer -- --remove` step in `docs/deployment.md` names it.
- `publicPaths: ["/"]`: the landing page and every verified route are public.

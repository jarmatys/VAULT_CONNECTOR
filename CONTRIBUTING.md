# Contributing

Thanks for your interest. The project is at an early stage, so the best contribution right now is an issue: a bug, a
missing vault source, or a case where the assistant did not find the right note.

## Ground rules

- **Everything in the repository is English:** code, comments, tests, commit messages, docs.
- **No real vault data.** Tests and examples use fictional notes only. Never paste your own notes, tokens or server
  addresses into an issue, a pull request or a fixture.
- **Security issues go through private reporting**, see [SECURITY.md](SECURITY.md).

## Pull requests

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Work on a branch of your fork and open a pull request against `master`.
3. Add tests with the change: unit tests for logic, integration tests for what a user sees.
4. Keep the checks green. The git hooks (`npm install` sets them up) run the same gates locally.

Workflows started by pull requests from forks run without secrets and wait for a maintainer's approval.

## How the project is planned

Work is planned with a spec-driven workflow: product notes, requirements and a roadmap in `context/foundation/`, and one
folder per change in `context/changes/`. You do not need to follow it for a contribution; a maintainer links your pull
request to it.

## License

By contributing you agree that your contribution is licensed under the [AGPL-3.0](LICENSE), the licence of this
project.

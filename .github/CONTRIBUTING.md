# Contributing

Thanks for your interest. This is a personal project, run by one owner.

## Before you open a pull request

- **Open an issue first** for anything larger than a typo, so we can agree on the change.
- Pull requests from forks are welcome. CI on a fork runs only after the owner approves it, and it never
  gets access to repository secrets.
- Only the owner merges. `main` is protected: every change goes through a pull request, all three CI
  gates (`backend-gate`, `frontend-gate`, `repo-gate`) must pass, and history stays linear (squash or
  rebase).

## Working in the repo

- Read [`AGENTS.md`](../AGENTS.md) for the project rules and [`docs/README.md`](../docs/README.md) for
  the documentation map.
- Run every check before pushing: `scripts/check-all.sh --no-install`.
- Regenerate the explorer: `npm --prefix backend run docs:generate`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:` …)
  with a bulleted body: root cause, changes, tests, docs.
- Add an entry under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md).
- Never commit `.env*`, `apikeys/` or `output/`.

## License

By contributing you agree that your contribution is licensed under the [MIT License](../LICENSE).

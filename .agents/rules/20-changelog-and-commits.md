---
trigger: always_on
description: "Rules for Conventional Commits and CHANGELOG maintenance"
---
<!-- GENERATED from docs/agents/rules/changelog-and-commits.md - DO NOT EDIT DIRECTLY -->

# Changelog & Commits
1. **Conventional Commits:** Use standard prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`.
2. **Commit Structure:** Every commit must have a multi-line bulleted body explaining root cause, changes, tests, and documentation updates.
3. **CHANGELOG Maintenance:** Add an entry under `## [Unreleased]` in `CHANGELOG.md` before every fix, feature, or structural change.
4. **Rebase vs Squash:** Pure moves and migrations requiring rebase-merge must keep pure moves in their own isolated commit before any edits. Single-commit phases use squash-merge.
5. **Single Repo Version:** Maintain a single repo version in `CHANGELOG.md` and keep app `package.json` versions aligned.

---
name: release
description: "Cut a release from CHANGELOG Unreleased."
---

1. Create a release branch `release/v<x.y.z>`.
2. Determine new version according to SemVer rules based on changes under `## [Unreleased]`.
3. In `CHANGELOG.md`, convert `## [Unreleased]` into `## [<x.y.z>] - YYYY-MM-DD` and insert a new blank `## [Unreleased]` section above it.
4. Update `"version": "<x.y.z>"` in `package.json`.
5. Run full verification: `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui && npm run docs:generate`.
6. Commit with `chore(release): cut v<x.y.z>` and open a pull request for owner review.

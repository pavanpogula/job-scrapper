# Role: docs-release-keeper

## Responsibilities
- Maintains documentation integrity across all 16 architecture, operations, and design documents.
- Maintains `CHANGELOG.md` following Keep a Changelog 1.1.0 specifications and Semantic Versioning.
- Maintains the ADR directory and index in `documentation/decisions/README.md`.
- Regenerates the interactive documentation visualizer (`docs/project-explorer.html`) via `npm run docs:generate`.
- Audits and maintains prompt/shell parity between Claude Code and Google Antigravity environments.
- Manages version bumping, release documentation, and release branches (`release/x.y.z`).

## Read-First List
1. `AGENTS.md`
2. `documentation/agents/context.md`
3. `documentation/README.md`
4. `CHANGELOG.md`
5. `documentation/decisions/README.md`
6. `documentation/agents/**`

## Allowed Scope
- `documentation/**`
- `CHANGELOG.md`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/**`
- `.agents/**`
- `scripts/GenerateDocs.ts`
- `package.json` (version bump on release)

## Output Contract
- Synchronized documentation, updated changelogs, verified agent shells, and cleanly generated explorer artifacts.

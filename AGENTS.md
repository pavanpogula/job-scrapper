# AGENTS.md

This repo is the **Ashby Job Scraper**, a TypeScript CLI toolkit (no web server).

**Before you do any work, read [`documentation/README.md`](./documentation/README.md).** It holds the full project context
(architecture, workflows, external API endpoints, CLI commands, DB/Redis schema, module reference, setup, and known issues).

Rules:
- Run things with `npm run <script>` (ts-node, so there's no build step). Type-check with `npx tsc --noEmit -p .`. Lint with `npm run lint`.
- Never print or commit `.env` or anything in `apikeys/`.
- Every new file and function needs a JSDoc `@file` / `@summary` / `@tags` block (ESLint and `npm run docs:generate` depend on it).
- If you change behaviour, update the matching file in `documentation/` and its "Last full analysis" date.

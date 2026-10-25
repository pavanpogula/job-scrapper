# Backend Agents Guide

> [!IMPORTANT]
> **Preferred Launch Location:** Prefer launching AI coding sessions from the monorepo root. If launched from `backend/`, verify all commands and paths are relative to this directory.

## Scope & Architecture
The backend application comprises:
1. **Batch CLI Scraper:** TypeScript CLI scraper feeding Neon PostgreSQL and Upstash Redis (`jc:v1:*` cache generations).
2. **REST API Server:** Express 5 server deployed on Vercel serverless (`backend/api/index.ts` invoking `backend/src/api/Server.ts`), protected by `CircuitBreaker`, `DbGuard`, and edge caching headers.
3. **Database & Cache:** Prisma ORM models against PostgreSQL and atomic double-buffered Redis publishing (`src/cache/Publisher.ts`).

## Verification & Commands
Run from `backend/`:
- **Full Verification:** `npm run check:all` (`prisma generate`, `typecheck`, `typecheck:test`, `lint`, `test`, `build`, `docs:check`).
- **Individual Checks:**
  - Tests: `npm test`
  - Typecheck: `npm run typecheck` and `npm run typecheck:test`
  - Lint: `npm run lint`
  - Docs Check: `npm run docs:check`

*Note: From the monorepo root, run `scripts/check-all.sh --no-install` or prefix with `npm --prefix backend run <script>`.*

## Working Directory & Secret Invariants
- **CWD:** All commands in this workspace run with `backend/` as the current working directory.
- **Secrets & Outputs:** Never read, print, stage, or commit `.env*`, `apikeys/`, `output/`, or `.vercel/` values.
- **Git Operations:** Commit only on task/phase branches with Conventional Commits. Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw `git push` or `gh`. Publish or update a task branch only with `../scripts/agents/push-branch.sh` (from `backend/`) (fast-forward only; it prints the pull-request link). The owner reviews and merges.

## Type Synchronization Summary
When modifying HTTP response shapes in `src/api/`:
- Follow the canonical `api-contract-sync` rule (`docs/agents/rules/api-contract-sync.md`).
- Update `backend/src/api/types.ts` (lands in P7) and the mapper in `src/api/Server.ts`.
- Run `npm run contract:fixtures` (available from P8a) to regenerate backend contract fixtures.
- Coordinate with `frontend/src/types/api.ts` to ensure frontend type parity.
- Changes must be additive-first; never remove fields the deployed frontend reads.

## Key Documentation
- Scraper architecture & workflows: `backend/docs/architecture-and-workflows.md`
- Express REST API contracts & routes: `backend/docs/api.md`
- Database schema & Redis cache: `backend/docs/database-and-cache.md`
- CLI commands & script reference: `backend/docs/cli-commands.md`
- Testing guide & mocks: `backend/docs/testing.md`
- Full documentation index: `docs/README.md`

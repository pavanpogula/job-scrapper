---
trigger: glob
globs: "backend/src/api/**, frontend/src/types/**, frontend/src/store/api/**, backend/tests/fixtures/contract/**, frontend/src/test/fixtures/contract/**"
description: "Protocol for API response shape changes and backend/frontend type contract parity"
---
<!-- GENERATED from docs/agents/rules/api-contract-sync.md - DO NOT EDIT DIRECTLY -->

# API Contract Synchronization Protocol

> [!NOTE]
> `backend/src/api/types.ts` lands in Phase P7.
> The `contract:fixtures` script and `scripts/contract/sync-fixtures.mjs` land in Phase P8a (commands marked below are available from P8a).

Any HTTP response-shape change MUST, in the same PR, do all of the following. A shape change means adding, removing or renaming a field, or changing its nullability, an enum, pagination, or the error body.

1. Update `backend/src/api/types.ts` (landing in P7) and the mapper.
2. Run `npm --prefix backend run contract:fixtures` (available from P8a) and commit `backend/tests/fixtures/contract/*`.
3. Run `node scripts/contract/sync-fixtures.mjs` (available from P8a) and commit the frontend copy.
4. Update `frontend/src/types/api.ts` until `npm --prefix frontend run check` passes.
5. Add a CHANGELOG entry tagged `contract`.
6. If cached bodies change, the PR notes that the owner must deploy the backend (run **Deploy to Vercel** with `app=backend`) and then dispatch `scrape-daily publish_only=true`.

## Guiding Invariants
- **Additive First:** Always make API response shape changes additive first.
- **Client Backward Compatibility:** Never remove a field the deployed frontend reads in the same release.
- **Autonomous Fixer Restriction:** The auto-fixer never changes API response shapes.

## Summary
<!-- Brief summary of problem and solution -->

### Triage & Classification
- **Issue Rule:** <!-- e.g. R-API-1 -->
- **Component:** <!-- e.g. AshbyClient -->
- **Fingerprint:** <!-- fp:<hash> -->

### Root Cause & Changes
- **Root Cause:** <!-- description with path:line -->
- **Fix:** <!-- description of fix -->
- **Invariant Guard:** <!-- BF-XXX -->

### Verification
- Mandatory checks:
  - `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json` (0 errors)
  - `npm run lint` (0 errors)
  - `npm test` (all tests pass)
  - `npm run verify:ui` (clean)
- Docs: `CHANGELOG.md` [Unreleased] updated.

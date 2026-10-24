---
name: verify-change
description: "Run all mandatory checks before committing."
---

Execute the complete Definition of Done verification suite:

```bash
npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui && npm run docs:generate
```

All commands must exit with code 0 before staging or committing any code changes.

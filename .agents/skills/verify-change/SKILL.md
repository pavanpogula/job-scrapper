---
name: verify-change
description: "Run all mandatory checks before committing."
---

Execute the complete Definition of Done verification suite:

```bash
scripts/check-all.sh --no-install
```

All commands must exit with code 0 before staging or committing any code changes.

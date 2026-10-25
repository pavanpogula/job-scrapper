---
paths: ["backend/prisma/**"]
---
<!-- GENERATED from docs/agents/rules/prisma-schema.md - DO NOT EDIT DIRECTLY -->

# Prisma Schema & Database Invariants
1. **Additive Changes Only:** Schema updates must be strictly additive (new tables, new nullable columns, new indexes). Destructive drops or breaking renames are prohibited.
2. **Client Generation:** Run `npx prisma generate` in `backend/` whenever `backend/prisma/schema.prisma` is modified.
3. **Index Efficiency:** Any foreign key or query filter column (company slug, department, location, posted date) must have an accompanying index.
4. **Content Hash Parity:** Any schema change affecting job comparison fields must update `calculateContentHash` in `backend/src/core/Scraper.ts` and the hash regression test.

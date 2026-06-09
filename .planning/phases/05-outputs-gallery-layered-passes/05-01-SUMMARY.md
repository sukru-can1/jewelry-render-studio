---
phase: 05-outputs-gallery-layered-passes
plan: 01
subsystem: outputs-foundation
tags: [schema, tdd-red, supply-chain, migration]
requires:
  - "Phase 1 Prisma topology (pooled DATABASE_URL + directUrl) and JobStatus enum"
  - "Phase 4 webhook persists Job.result (lib/orchestration/webhook.ts)"
  - "Vitest 4.1.8 harness (test/setup.ts, test/factories.ts)"
provides:
  - "Layer.jobId @unique constraint (idempotent prisma.layer.upsert by jobId)"
  - "archiver@8 + @types/archiver (zip streaming dep for Plan 03)"
  - "six failing RED test scaffolds for OUT-01/02/03"
affects:
  - "Plan 02 (W2): deriveLayerFromResult, groupLayers, loadBatchGallery turn the scaffolds green"
  - "Plan 03: /api/file download header + batch zip route turn their scaffolds green"
  - "Plan 01 W1: buildEnterpriseRecipe stone-pass transparency turns out-stone-transparency green"
tech-stack:
  added:
    - "archiver@8.0.0 (current major of archiverjs/node-archiver; ^7 in RESEARCH was [ASSUMED])"
    - "@types/archiver@8.0.0"
  patterns:
    - "RED scaffold imports of not-yet-existing modules guarded with // @ts-expect-error to keep tsc --noEmit exit 0 while runtime stays RED"
key-files:
  created:
    - "prisma/migrations/20260609120000_layer_job_unique/migration.sql"
    - "test/out-stone-transparency.test.ts"
    - "test/out-layer-derive.test.ts"
    - "test/out-gallery-group.test.ts"
    - "test/out-gallery-query.test.ts"
    - "test/out-file-download.test.ts"
    - "test/out-zip-route.test.ts"
  modified:
    - "prisma/schema.prisma"
    - "package.json"
    - "package-lock.json"
decisions:
  - "archiver resolves to 8.0.0 (not the ^7.0.1 RESEARCH [ASSUMED] version); 8.x is the current published major of the same archiverjs/node-archiver package — installed archiver@8 rather than pinning a stale 7.x."
  - "Migration applied via manually-authored migration.sql + `prisma migrate deploy` because `prisma migrate dev` aborts in the non-interactive executor; the SQL is the exact additive `CREATE UNIQUE INDEX Layer_jobId_key` that migrate dev would emit."
  - "out-layer-idempotent.test.ts folded INTO out-layer-derive.test.ts per the plan (duplicate-call → same where:{jobId} upsert assertion); no separate file."
metrics:
  duration: 22min
  tasks: 3
  files: 9
  completed: 2026-06-09
---

# Phase 5 Plan 01: Outputs Foundation (schema + RED scaffolds + dependency vetting) Summary

Locked the Phase-5 idempotency invariant into the live DB (`Layer.jobId @unique`),
front-loaded all six Phase-5 requirement tests as failing RED scaffolds, and
vetted+installed the `archiver` zip-streaming dependency.

## What Was Built

- **Task 1 — archiver (T-05-SC):** Verified `archiver` and `@types/archiver`
  resolve on the npm registry (current published version 8.0.0, the long-established
  archiverjs/node-archiver package). Orchestrator pre-approved the supply-chain
  checkpoint, so the executor installed without pausing. RESEARCH tagged `^7.0.1`
  as `[ASSUMED]`; the real current major is 8.x — installed `archiver@8`.
- **Task 2 — Layer.jobId @unique (T-05-01):** Added `@unique` to `Layer.jobId` so
  `prisma.layer.upsert({where:{jobId}})` is race-free against duplicate/late
  webhooks (one job = exactly one layer). Confirmed zero existing Layer rows, then
  applied the additive `CREATE UNIQUE INDEX Layer_jobId_key` to the live Railway DB.
  `prisma migrate status` reports the schema up to date; client regenerated.
- **Task 3 — six RED scaffolds:** One failing test per Phase-5 behavior in
  05-VALIDATION.md, reusing the Vitest harness (fakeSession, vi.mock of
  `@/lib/db/prisma`, `@vercel/blob`, `@/lib/auth/rbac` per blob-guard.test.ts).
  All six fail for the right reason (missing module or missing behavior).

## Verification Results

- `npx prisma migrate status` — exit 0, "Database schema is up to date!" (4 migrations).
- Six scaffolds run RED: `6 failed (6)` files; 4 failed / 3 passed tests. The 3
  passing assertions are the already-true cases (metal-pass opaque, full-pass
  unchanged, existing /api/file unauth→401) — correct RED, not false green.
- `npx tsc --noEmit` — exit 0 (RED imports suppressed with `// @ts-expect-error`).
- `npx next build` — succeeds (all routes compiled).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate dev` is non-interactive in the executor**
- **Found during:** Task 2
- **Issue:** `npx prisma migrate dev --name layer-job-unique` aborts with
  "environment is non-interactive, which is not supported."
- **Fix:** Authored the migration directory + `migration.sql` (the exact additive
  `CREATE UNIQUE INDEX Layer_jobId_key`) and applied it with `prisma migrate deploy`
  — same DB outcome, no reset, no existing column changed.
- **Files:** prisma/migrations/20260609120000_layer_job_unique/migration.sql
- **Commit:** dc3aee2

**2. [Rule 3 - Blocking] RED scaffold imports break `tsc --noEmit` exit 0**
- **Found during:** Task 3
- **Issue:** Importing not-yet-existing modules (`@/lib/gallery/group`,
  `@/lib/gallery/query`, `@/lib/orchestration/layers`, the zip route) produces TS2307,
  conflicting with the success criterion `tsc --noEmit exit 0`.
- **Fix:** Annotated each missing import with `// @ts-expect-error` (and typed the
  one implicit-any `.find` callback). tsc passes; the runtime import still throws, so
  the tests remain RED until later waves create the modules.
- **Files:** the four scaffolds with missing-module imports.
- **Commit:** fa3fc91

### archiver version note
RESEARCH assumed `archiver ^7.0.1`; the registry's current published major is `8.0.0`.
Installed `archiver@8` (same archiverjs package). Plan 03 should import against the v8 API.

## Dependency / Supply-Chain Notes

`npm install` reported 5 pre-existing audit advisories (2 moderate, 3 high) in the
broader tree — **not** introduced by archiver and out of this plan's scope (logged here,
not fixed; no `npm audit fix --force` run as it carries breaking changes).

## Known Stubs

None. The six test files are intentional failing scaffolds (TDD RED), not stubs —
later waves implement the modules they import.

## Self-Check: PASSED

- prisma/migrations/20260609120000_layer_job_unique/migration.sql — FOUND
- test/out-stone-transparency.test.ts — FOUND
- test/out-layer-derive.test.ts — FOUND
- test/out-gallery-group.test.ts — FOUND
- test/out-gallery-query.test.ts — FOUND
- test/out-file-download.test.ts — FOUND
- test/out-zip-route.test.ts — FOUND
- commit d1c51ea (archiver) — FOUND
- commit dc3aee2 (Layer.jobId @unique) — FOUND
- commit fa3fc91 (RED scaffolds) — FOUND

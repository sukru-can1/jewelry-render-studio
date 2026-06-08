---
phase: 02-product-workspace
plan: 01
subsystem: database
tags: [prisma, postgres, zod, vercel-blob, vitest, inventory, rbac]

# Dependency graph
requires:
  - phase: 01-secure-foundation-secrets-db-auth
    provides: "Prisma 6 schema + singleton, Auth.js v5 requireSession/requireRole, @vercel/blob 2.4 private store + /api/file proxy, Vitest harness (setup/factories), lib/runpod.ts"
provides:
  - "Inspection model (migrated to live Railway DB) + Product.inspections back-relation"
  - "Idempotent StoneType seed (10 canonical rows)"
  - "Private blob upload tokens (access:'private') — SEC-02 fix"
  - "lib/inventory.ts parseInventory (MESH-only, defensive BSDF, object signatures)"
  - "lib/tokens.ts suggestGroup (four-group token-assist)"
  - "lib/validation/product.ts + lib/validation/settings.ts zod schemas"
  - "lib/blob.ts workerModelUrl() — tokenless signed-GET URL for the private-blob worker read"
  - "Test fixtures (inventoryFixture, assignmentFactory) + 4 new test files"
affects: [product-create-upload, inspection-dispatch, group-assignment, domain-settings, batch-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated Inspection model (not Job-overload) for batchless material inspections"
    - "Defensive BSDF socket lookup by normalized substring (Blender version drift)"
    - "Server-minted signed-GET URL (issueSignedToken + presignUrl) for unauthenticated worker reads of private blobs"

key-files:
  created:
    - prisma/migrations/20260608095403_add_inspection/migration.sql
    - lib/inventory.ts
    - lib/tokens.ts
    - lib/validation/product.ts
    - lib/validation/settings.ts
    - test/stonetype-seed.test.ts
    - test/inventory-parser.test.ts
    - test/tokens.test.ts
    - test/product-upload-token.test.ts
  modified:
    - prisma/schema.prisma
    - prisma/seed.ts
    - app/api/blob/upload/route.ts
    - lib/blob.ts
    - test/factories.ts

key-decisions:
  - "Inspection is a dedicated model (Job.batchId is required-non-null; an inspection has no batch)"
  - "StoneType seeded with 10 canonical rows from the domain material system, idempotent via upsert-by-key"
  - "workerModelUrl mints a ~1h signed GET URL via issueSignedToken+presignUrl — no public/obscurity fallback, never persisted (SEC-02/T-02-03)"
  - "Dropped round_5/round_6 from the diamond token rule (collided with stone2 round_ prefix, broke the behavior contract)"

patterns-established:
  - "Pure-logic libs (inventory, tokens) parse worker output defensively and never throw on malformed input"
  - "Validation schemas carry UI-SPEC error copy verbatim so surfaced text matches the spec"

requirements-completed: [PROD-01, PROD-02, PROD-03, PROD-04, DATA-04]

# Metrics
duration: 38min
completed: 2026-06-08
---

# Phase 2 Plan 01: Product Workspace Foundation Summary

**Wave-0 contract layer: migrated Inspection model + idempotent StoneType seed, private blob upload tokens, MESH-only defensive inventory parser, four-group token-assist, product/settings zod schemas, and a signed-GET worker-read URL — all test-backed, no UI.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-06-08T12:55Z
- **Completed:** 2026-06-08T13:38Z
- **Tasks:** 3 of 3
- **Files modified/created:** 13

## Accomplishments
- Added and migrated the `Inspection` model to the live Railway DB (decision #3 — not a Job overload), with the `Product.inspections` back-relation and a `productId` index.
- Seeded 10 canonical `StoneType` rows idempotently, closing the DATA-04 prerequisite (the table was previously unseeded).
- Closed the SEC-02 gap: the blob upload-token route now mints `access:'private'` tokens, and `workerModelUrl()` mints a tokenless ~1h signed-GET URL (issueSignedToken + presignUrl) so the unauthenticated RunPod worker can read private model blobs — with no public/obscurity fallback.
- Shipped the pure-logic contract libraries (`parseInventory` MESH-filter + defensive BSDF, `suggestGroup` four-group mapping) and the product/settings zod schemas every downstream slice builds on.

## Task Commits

1. **Task 1: Inspection model + migrate + StoneType seed** - `8f7c857` (feat) [+ live `migrate dev` and `db seed`]
2. **Task 2: Inventory parser + token-assist (TDD)** - `4b9dc9c` (test, RED) → `4257021` (feat, GREEN)
3. **Task 3: Validation + private upload-token fix + workerModelUrl (TDD)** - `5706607` (test, RED) → `877566e` (feat, GREEN)

_TDD gate compliance: each TDD task has a `test(...)` RED commit before its `feat(...)` GREEN commit._

## Files Created/Modified
- `prisma/schema.prisma` - Added `model Inspection` + `Product.inspections` relation.
- `prisma/migrations/20260608095403_add_inspection/migration.sql` - Applied to live Railway DB.
- `prisma/seed.ts` - Added `stoneTypes[]` + idempotent `stoneType.upsert` loop.
- `app/api/blob/upload/route.ts` - `onBeforeGenerateToken` now returns `access:'private'`.
- `lib/blob.ts` - Added `workerModelUrl()` (issueSignedToken + presignUrl → presignedUrl).
- `lib/inventory.ts` - `parseInventory` (MESH-only, defensive principled-socket extraction, object signatures).
- `lib/tokens.ts` - `suggestGroup` deterministic four-group rule table.
- `lib/validation/product.ts` - `createProductSchema` + `assignmentSchema` (+ group/format enums).
- `lib/validation/settings.ts` - cameraView/metal/stoneType/qualityPreset schemas with UI-SPEC copy.
- `test/factories.ts` - Added `inventoryFixture()` + `assignmentFactory()`.
- `test/{stonetype-seed,inventory-parser,tokens,product-upload-token}.test.ts` - New coverage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Token-assist rule-table collision (`round_5` / `round_6`)**
- **Found during:** Task 2 (GREEN)
- **Issue:** The RESEARCH Pattern 6 rule table lists `round_5`/`round_6` under the `diamond` group, but the stone2 group uses the `round_` prefix. Because diamond is evaluated before stone2 and first-rule-wins, `suggestGroup("round_5 side")` returned `"diamond"`, violating the plan's explicit behavior contract (`"round_5 side"` → `"stone2"`).
- **Fix:** Removed `round_5`/`round_6` from the diamond rule (they were redundant — the center stone reaches `diamond` via `center`/`solitaire`/`diamond`/`main`, and `round_` already covers them for stone2). Added an inline comment explaining the collision.
- **Files modified:** `lib/tokens.ts`
- **Commit:** `4257021`

## @vercel/blob API Verification

The plan's environment notes asked to verify `issueSignedToken`/`presignUrl` against the installed 2.4.0. Verified in `node_modules/@vercel/blob/dist/create-folder-DFjrvss1.d.ts`:
- `issueSignedToken({ pathname, operations: ['get'], validUntil }) => Promise<IssuedSignedToken>` — exact match, no adaptation needed.
- `presignUrl(signedToken, { operation: 'get', pathname, access: 'private' }) => Promise<{ presignedUrl }>` — exact match.

Both are exported from the `@vercel/blob` package root. No import-name adaptation was required.

## Verification Results
- `npx prisma validate` — exits 0; schema valid.
- `npx prisma migrate status` — "Database schema is up to date!"
- `npx vitest run` — **14 files, 72 tests, all green** (includes the 4 new test files).
- `npx tsc --noEmit` — exit 0.
- Greps: `model Inspection` (schema), `stoneType.upsert` (seed), `access:"private"` (upload route), `issueSignedToken`/`presignUrl` (blob.ts) all present; no `access:"public"` in `lib/blob.ts`.

## Known Stubs
None — this plan is the contract layer; all exports are fully implemented and test-backed.

## Self-Check: PASSED
- Created files verified present: `lib/inventory.ts`, `lib/tokens.ts`, `lib/validation/product.ts`, `lib/validation/settings.ts`, `prisma/migrations/20260608095403_add_inspection/migration.sql`, 4 new test files — all FOUND.
- Commits verified in `git log`: `8f7c857`, `4b9dc9c`, `4257021`, `5706607`, `877566e` — all FOUND.

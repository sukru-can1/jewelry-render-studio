---
phase: 01-secure-foundation-secrets-db-auth
plan: 01
subsystem: data-foundation
tags: [prisma, env, vitest, dependencies, walking-skeleton]
requires: []
provides:
  - "prisma/schema.prisma — DATA-01 relational schema + Role/JobStatus enums + pooled datasource"
  - "lib/db/prisma.ts — DATA-02 PrismaClient globalThis singleton"
  - "lib/env.ts — fail-fast typed env (@t3-oss/env-nextjs)"
  - "vitest.config.ts + test/setup.ts + test/factories.ts — Wave-0 test harness"
  - "package.json — pinned Phase-1 deps + build/test/seed scripts"
affects:
  - package.json
  - .gitignore
  - .env.example
tech-stack:
  added:
    - "next-auth@5.0.0-beta.31 (exact pin)"
    - "@prisma/client@6.19.2 + prisma@6.19.2 (exact, NOT @latest)"
    - "bcryptjs@^3.0.3"
    - "@vercel/blob@^2.4.0 (upgrade from ^1.0.2)"
    - "zod@^3.25.76 (STACK lock, NOT zod 4)"
    - "@t3-oss/env-nextjs@^0.13.11"
    - "geist, tsx, vitest, @vitejs/plugin-react, vite-tsconfig-paths, @types/bcryptjs (dev)"
  patterns:
    - "Prisma serverless singleton on globalThis (DATA-02)"
    - "Typed fail-fast env via createEnv (SEC-01 / T-1-CONFIG-01)"
    - "Pooled DATABASE_URL + directUrl for migrations (DATA-02)"
key-files:
  created:
    - prisma/schema.prisma
    - lib/db/prisma.ts
    - lib/env.ts
    - vitest.config.ts
    - test/setup.ts
    - test/factories.ts
    - test/prisma-singleton.test.ts
  modified:
    - package.json
    - .env.example
    - .gitignore
decisions:
  - "Pinned @prisma/client + prisma to exact 6.19.2 (not caret) to match the next-auth exact-pin discipline and the STACK Prisma-6 lock."
  - "test/setup.ts uses a dependency-free .env loader rather than `dotenv` to avoid an undeclared package dependency in the harness."
  - "Added the opposite relation fields the RESEARCH schema sketch omitted (Prisma 6 requires both sides) so `prisma validate` passes — minimal, FK-only, no model added."
metrics:
  duration_min: 7
  completed: 2026-06-05
  tasks: 3
  files: 10
---

# Phase 1 Plan 01: Secure Foundation Data Substrate Summary

Stood up the Phase-1 data substrate in one pass — pinned dependency install, the Prisma schema (DATA-01) + serverless-safe globalThis singleton (DATA-02) + typed fail-fast env, and the Vitest Wave-0 harness every later plan verifies against. `prisma validate` is clean and 5 harness tests pass.

## What Was Built

### Task 1 — Pinned deps + build/test scripts (commit `46d2cb2`)
- Installed exact pins: `next-auth@5.0.0-beta.31`, `prisma`/`@prisma/client@6.19.2` (explicitly NOT `@latest` = 7.x), plus `bcryptjs`, `@vercel/blob@^2.4.0`, `zod@^3.25`, `@t3-oss/env-nextjs`, `geist`, and dev tooling (`tsx`, `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@types/bcryptjs`).
- `package.json` scripts: `build` = `prisma generate && prisma migrate deploy && next build`; added `postinstall` (`prisma generate`), `test`, `test:dot`, `db:seed`; top-level `prisma.seed` = `tsx prisma/seed.ts`.
- `.env.example` gained 6 placeholder vars (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `RUNPOD_WEBHOOK_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`) — placeholders only, no real values.
- `.gitignore` hardened: explicit `.env.local`, `.env*.local`, `next-dev.*.log`, `outputs/*.log`, plus `tsconfig.tsbuildinfo`.

### Task 2 — Schema + singleton + env, TDD (commit `c3f13fd`)
- `prisma/schema.prisma`: `enum Role { Admin Operator }`, `enum JobStatus { queued submitted in_queue in_progress completed failed cancelled }`, datasource with `url = env("DATABASE_URL")` (pooled) + `directUrl = env("DIRECT_URL")` (migrations only), and all 12 models (User, CameraView, Metal, StoneType, ObjectGroup, QualityPreset, Project, Product, ObjectGroupAssignment, Batch, Job with `@@index([batchId, status])` + `runpodJobId`, Layer). `prisma validate` passes; client generated to `node_modules/.prisma/client`.
- `lib/db/prisma.ts`: globalThis-cached `PrismaClient`, only attached to globalThis when `NODE_ENV !== "production"` (DATA-02).
- `lib/env.ts`: `createEnv` with all 7 required server secrets `z.string().min(1)` + optional seed creds — fails fast on missing (SEC-01).
- `test/prisma-singleton.test.ts`: 5 tests — singleton identity, globalThis cache, schema-text assertions (`directUrl`, `JobStatus`, `User`, `Role`), and env-throw on a missing required var.

### Task 3 — Vitest Wave-0 harness (commit `faae7ce`)
- `vitest.config.ts`: `vite-tsconfig-paths` (resolves `@/*`) + `@vitejs/plugin-react`, `environment: "node"`, `setupFiles: ["./test/setup.ts"]`, no watch flags.
- `test/setup.ts`: dependency-free `.env.local`/`.env` loader, `fakeSession(role)` helper, `testPrisma` accessor (import-safe, no DB connection at load).
- `test/factories.ts`: `adminUser()` / `operatorUser()` factories with real bcrypt `passwordHash` for later RBAC/admin tests.

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Schema valid | `npx prisma validate` | valid 🚀 |
| Harness green | `npx vitest run` | 5/5 passed |
| Type-check | `npx tsc --noEmit` | exit 0 |
| Version pins | package.json inspect | next-auth `5.0.0-beta.31`, prisma/@prisma/client `6.19.2`, zod `^3.25.76`, blob `^2.4.0` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing opposite relation fields to schema**
- **Found during:** Task 2 (`prisma validate` failed with 5 relation errors).
- **Issue:** The RESEARCH "Minimal Prisma schema" sketch listed `Product[]`/`Batch[]`/`Job[]`/`Layer[]` list fields but omitted the required opposite-side relation fields + FKs; Prisma 6 rejects one-sided relations.
- **Fix:** Added `project`/`product`/`batch`/`job` belongs-to relation fields with `@relation(fields:[fk], references:[id])` on Product, ObjectGroupAssignment, Batch, Job, Layer. No new models, no semantic change — purely completes the relations the sketch implied.
- **Files modified:** `prisma/schema.prisma`
- **Commit:** `c3f13fd`

### Discretionary Decisions
- **Exact-pinned `@prisma/client`/`prisma` to `6.19.2`** (not caret) to mirror the `next-auth` exact-pin discipline and the STACK Prisma-6 lock; `.includes("6.19.2")` verification still satisfied.
- **`test/setup.ts` uses a hand-rolled `.env` loader** instead of `dotenv` (which is only a transitive dep) to keep the harness free of undeclared package dependencies.

## Notes / Hand-off for Later Plans
- **No migration run** (per plan + environment notes) — `prisma migrate dev/deploy` is Plan 01-02's [BLOCKING] task against the live Railway DB. The schema validates and the client is generated, so 01-02 can migrate immediately.
- **`.env.local` untouched** — live `DATABASE_URL`/`DIRECT_URL`/`AUTH_SECRET`/`RUNPOD_WEBHOOK_SECRET` confirmed present (not printed); never regenerated or staged (gitignored).
- **File ownership respected** — did NOT touch `components.json`, `app/globals.css`, `app/layout.tsx`, `postcss.config.mjs`, `lib/utils.ts` (owned by parallel plan 01-01b). No Tailwind/shadcn deps hand-added.
- **Prisma config deprecation warning**: `package.json#prisma` seed key is deprecated for Prisma 7; harmless on the locked Prisma 6, surfaces only as a warning. Migrating to `prisma.config.ts` is a future-Prisma-7 concern, out of scope here.

## Known Stubs
None — the Project/Product/Batch/Job/Layer models are intentional relational stubs whose full use lands in later phases (DATA-01 explicitly creates them now "so the model is stable"); they are schema definitions, not rendered placeholders.

## Self-Check: PASSED
- All 7 created files verified on disk.
- All 3 task commits (`46d2cb2`, `c3f13fd`, `faae7ce`) verified in git log.

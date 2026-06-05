---
phase: 01-secure-foundation-secrets-db-auth
plan: 02
subsystem: data-foundation
tags: [prisma, migration, seed, railway-postgres, vitest, pooling, walking-skeleton]
requires:
  - "prisma/schema.prisma (01-01) — DATA-01 schema + Role/JobStatus enums + pooled datasource"
  - "lib/db/prisma.ts (01-01) — DATA-02 PrismaClient globalThis singleton"
  - "Live Railway Postgres 16 — DATABASE_URL (pooled) + DIRECT_URL in .env/.env.local"
provides:
  - "prisma/migrations/20260605073714_init — DATA-01 applied initial migration (live DB up to date)"
  - "prisma/seed.ts — DATA-03 idempotent domain seed + env-driven first Admin; exports seedDomain()"
  - "test/seed-domain.test.ts — exact-value + metal-hex + 1920x1920 + Admin + idempotency assertions"
  - "test/prisma-pool.test.ts — DATA-02 concurrency proof (no P2024)"
  - "docs/DB_SETUP.md — pooled/direct topology, migrate/seed commands, migration-URL rule"
affects:
  - prisma/migrations
tech-stack:
  added: []
  patterns:
    - "Idempotent upsert-by-key domain seed (DATA-03)"
    - "Env-driven first-Admin bootstrap via bcrypt(12), no hardcoded credentials (T-1-SEED)"
    - "Migrations via DIRECT_URL only; app traffic via pooled DATABASE_URL (T-1-MIGRATE / DATA-02)"
    - "CLI-guarded seed module (self-runs only as entrypoint) so tests can import seedDomain()"
key-files:
  created:
    - prisma/migrations/20260605073714_init/migration.sql
    - prisma/migrations/migration_lock.toml
    - prisma/seed.ts
    - test/seed-domain.test.ts
    - test/prisma-pool.test.ts
    - docs/DB_SETUP.md
  modified: []
decisions:
  - "Resolved an initial P1001 (Railway proxy cold-start / SSL handshake) by warming the connection; once awake, both plain and sslmode=require connections succeed, so the stored .env URLs were used as-is with NO modification/regeneration."
  - "seed.ts re-exports seedDomain() and guards its CLI self-run by inspecting process.argv[1], so the test imports and invokes the seed without a second PrismaClient (shares the lib/db/prisma.ts singleton)."
  - "Raised Vitest hook/test timeouts for the remote Railway round-trips (seed twice + bcrypt(12) exceed the default 10s); added a cold-start warm-up retry to the pool test to remove Railway-idle flakiness."
metrics:
  duration_min: 11
  completed: 2026-06-05
  tasks: 3
  files: 6
---

# Phase 1 Plan 02: Database Migration + Domain Seed Summary

Brought the Phase-1 database to life against live Railway Postgres: applied the initial migration (DATA-01), seeded the exact DATA-03 domain settings plus an env-driven first Admin, and proved the pooled singleton survives concurrency (DATA-02). A real query now returns the seeded 4 views / 3 metals / 4 groups / 4 presets at 1920×1920 from Postgres.

## What Was Built

### Task 1 — Apply the Phase-1 init migration (commit `7f80660`)
- The [BLOCKING] checkpoint precondition was pre-satisfied by the orchestrator (live DB provisioned, blocker cleared), so I proceeded without pausing.
- `npx prisma migrate dev --name init` created and applied `prisma/migrations/20260605073714_init/` (User/Role + JobStatus + the 5 domain tables + Project/Product/ObjectGroupAssignment/Batch/Job/Layer) against the live DB via `DIRECT_URL`.
- `npx prisma migrate status` → "Database schema is up to date" (exit 0).

### Task 2 — DATA-03 domain + Admin seed, TDD (RED `a4fff27` → GREEN `d8edaff`)
- **RED:** `test/seed-domain.test.ts` failed first (no `prisma/seed.ts` module).
- **GREEN:** `prisma/seed.ts` upserts by unique `key`:
  - 4 camera views with exact az/el/focal/fStop (view1 30/25/187.5/2.8, view2 180/15/187.5/2.8, view3 -30/10/50/2.8, view4 0/75/187.5/2.8).
  - 3 metals with exact swatch hex: white `#C4C4C4`, yellow `#FFC356`, red `#E09973`.
  - 4 object groups (alloycolour/diamond/stone2/stone3, sortOrder 0..3).
  - 4 quality presets (preview 64 / medium 256 / high 512 / ultra 2048), every preset 1920×1920.
  - First Admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` via `bcrypt.hash(pw, 12)`, `role: "Admin"` — skipped (logged) when env absent.
- Idempotent on re-run (seed runs twice in the test's `beforeAll`); seed is CLI-guarded so importing it in the test does not self-run.

### Task 3 — Pool-health test + DB setup docs (commit `139bad0`)
- `test/prisma-pool.test.ts`: 25 concurrent `$queryRaw SELECT 1` + 25 concurrent `cameraView.count()` through the `lib/db/prisma.ts` singleton all resolve with no P2024 / pool exhaustion (DATA-02). Cold-start warm-up retry removes Railway-idle flakiness.
- `docs/DB_SETUP.md`: documents the pooled `DATABASE_URL` vs `DIRECT_URL` split, `migrate dev`/`migrate deploy`/`db seed` commands, the env-driven Admin, and the never-migrate-over-the-pooled-URL rule — no secrets.

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Migration applied | `npx prisma migrate status` | Database schema is up to date |
| Seed runs | `npx prisma db seed` | DATA-03 domain seed complete |
| Seed values + hex | `npx vitest run seed-domain` | 6/6 passed |
| Pool health | `npx vitest run prisma-pool` | 2/2 passed (no P2024) |
| Full suite | `npx vitest run` | 3 files / 13 tests passed |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed Railway cold-start test flakiness**
- **Found during:** Task 2 and Task 3 (first run after the DB had been idle timed out the default 10s hook / 30s test).
- **Issue:** Railway's external proxy pays a multi-second cold-start on the first connection after idle; the timed assertions absorbed that one-off cost and failed intermittently. The assertions themselves never reported P2024 — the failure was connection-establishment latency.
- **Fix:** Raised the `beforeAll`/test timeouts for remote round-trips (seed runs the seed twice + bcrypt(12)) and added a warm-up retry loop in the pool test's `beforeAll`. The pool assertions still surface a genuine P2024 if one occurs.
- **Files modified:** `test/seed-domain.test.ts`, `test/prisma-pool.test.ts`
- **Commits:** `d8edaff`, `139bad0`

### Discretionary Decisions
- **`.env`/`.env.local` left untouched.** An initial `prisma migrate status` returned P1001; investigation (raw TCP connect OK, PG SSLRequest returns "S", and a plain Prisma `SELECT 1` subsequently succeeded) showed it was a Railway proxy cold-start, not a config/SSL defect. Once the backend was awake, both plain and `sslmode=require` connections worked, so the stored URLs were used as-is — never modified, regenerated, or printed.
- **`seedDomain()` re-export + CLI guard.** The seed exports `seedDomain()` for the test and self-runs only when invoked as the process entrypoint (`process.argv[1]` ends in `seed.*`), so the test shares the app's `lib/db/prisma.ts` singleton instead of opening a second client.

## Authentication Gates
None. The [BLOCKING] migrate checkpoint's precondition (live DB) was already satisfied by the orchestrator; no human action was required.

## Notes / Hand-off for Later Plans
- **First Admin not yet seeded in the live DB:** `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` are not present in `.env`/`.env.local`, so `npx prisma db seed` seeded only the domain settings and logged a skip for the Admin. The Admin-creation path is fully tested (the seed-domain test sets the env itself and verifies a bcrypt-verifiable Admin). The auth slice (Plan 01-03) or an operator should set `SEED_ADMIN_*` and re-run `npx prisma db seed` to bootstrap the live first Admin.
- **File ownership respected:** did NOT touch auth files (Plan 01-03) or design tokens (Plan 01-01b).
- **Prisma config deprecation warning** (`package.json#prisma` seed key) persists from 01-01 — harmless on the locked Prisma 6; a future Prisma-7 `prisma.config.ts` concern, out of scope.

## Known Stubs
None — the domain settings are fully seeded with real values; the Project/Product/Batch/Job/Layer tables are intentional relational stubs from DATA-01 (schema definitions, not rendered placeholders).

## Self-Check: PASSED
- `prisma/migrations/20260605073714_init/migration.sql` — FOUND
- `prisma/seed.ts` — FOUND
- `test/seed-domain.test.ts` — FOUND
- `test/prisma-pool.test.ts` — FOUND
- `docs/DB_SETUP.md` — FOUND
- Commits `7f80660`, `a4fff27`, `d8edaff`, `139bad0` — FOUND in git log

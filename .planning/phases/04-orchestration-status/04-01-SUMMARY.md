---
phase: 04-orchestration-status
plan: 01
subsystem: orchestration-foundation
tags: [prisma, migration, env, vercel-cron, status-map, tdd]
requires: []
provides:
  - "Job.result / Job.startedAt / Job.cancelRequestedAt / Batch.cancelRequestedAt nullable columns"
  - "env.CRON_SECRET (required) + env.APP_URL (optional) + resolveAppBaseUrl()"
  - "vercel.json crons for /api/cron/dispatch + /api/cron/reconcile"
  - "lib/orchestration/status-map.ts (mapRunPodStatus / TERMINAL_STATUSES / isTerminal / tail)"
  - "7 Phase-4 test scaffolds locking the ORCH-01..05 contracts"
affects:
  - "Wave 1 (04-02 dispatch + webhook), Wave 2 (04-03 reconcile/retry, 04-04 cancel), Wave 3 (04-05 progress/pages)"
tech-stack:
  added: []
  patterns:
    - "Single shared mapRunPodStatus reused by webhook + reconcile (Don't Hand-Roll)"
    - "Additive-only nullable migrations against the live seeded DB"
    - "RED test scaffolds importing not-yet-built modules to lock acceptance criteria"
key-files:
  created:
    - lib/orchestration/status-map.ts
    - prisma/migrations/20260609055206_orchestration_fields/migration.sql
    - test/orch-dispatch.test.ts
    - test/orch-webhook.test.ts
    - test/orch-reconcile.test.ts
    - test/orch-retry.test.ts
    - test/orch-cancel.test.ts
    - test/orch-progress.test.ts
    - test/orch-db-only.test.ts
  modified:
    - prisma/schema.prisma
    - lib/env.ts
    - .env.example
    - vercel.json
decisions:
  - "#4 additive-only migration: four nullable columns, reuse Job.error + Job.runpodJobId (no log/runpodRequestId)"
  - "#5 CRON_SECRET required (fail-fast), APP_URL optional with VERCEL_PROJECT_PRODUCTION_URL fallback"
  - "A4 Batch.status stays derived String, never a 6th stored enum value"
  - "A5 dispatcher refuses to submit when no https base URL resolves (no https://undefined webhook)"
metrics:
  duration: ~25m
  completed: 2026-06-09
---

# Phase 04 Plan 01: Orchestration Foundation Summary

Wave-0 foundation for Phase 4: an additive Prisma migration (4 nullable columns), two typed env vars with an `https`-validating base-URL resolver, the Vercel cron schedule that fires the dispatch/reconcile routes, a single shared RunPod→DB status mapper, and 7 RED test scaffolds that lock every ORCH requirement's acceptance criteria before implementation.

## What Was Built

- **Task 1 — Additive migration (`18bd92e`):** Added `Job.result Json?`, `Job.startedAt DateTime?`, `Job.cancelRequestedAt DateTime?`, `Batch.cancelRequestedAt DateTime?`. The generated `migration.sql` is **ADD COLUMN only** — no DROP/ALTER/RENAME of any existing column. Applied cleanly against the live Railway DB with **no reset prompt**; `prisma migrate status` reports "Database schema is up to date" (3 migrations). Client regenerated.
- **Task 2 — Typed env (`a63b8e2`):** `CRON_SECRET: z.string().min(1)` (required, fail-fast) and `APP_URL: z.string().url().optional()` added to `lib/env.ts`. Added exported `resolveAppBaseUrl()` returning a normalized `https` origin from `APP_URL` or `https://${VERCEL_PROJECT_PRODUCTION_URL}`, else `null` (A5). `.env.example` documents both. Confirmed `RUNPOD_WEBHOOK_SECRET` remains the single webhook-secret name.
- **Task 3 — Vercel crons (`95bcc6c`):** Added a `crons` array scheduling `/api/cron/dispatch` and `/api/cron/reconcile` at `* * * * *`, alongside the untouched `framework`/`functions` keys. JSON stays valid; `next build` passes.
- **Task 4 — Status-map + RED scaffolds (`3ecd6d8`):** `lib/orchestration/status-map.ts` exports `mapRunPodStatus` (COMPLETED→completed, FAILED/TIMED_OUT→failed, CANCELLED→cancelled, IN_PROGRESS→in_progress, IN_QUEUE→in_queue, unknown→null), `TERMINAL_STATUSES` (completed/failed/cancelled), `isTerminal`, and `tail(text, max=4000)`. Seven test files mirror `inspection-dispatch.test.ts` mocking style and cover ORCH-01..05, including the A5 no-base-URL no-submit case, the W-1 null-`runpodJobId` stranded sweep, and the W-3 `cancelRunPod` POST `/v2/{endpoint}/cancel/{id}` call shape.

## TDD Gate Compliance

Task 4 is the plan's RED gate. `lib/orchestration/status-map.ts` is GREEN (its 2 contract assertions pass). The 6 implementation-target test files (dispatch/webhook/reconcile/retry/cancel/progress) are intentionally RED — they import Wave 1/2/3 modules that do not exist yet; later waves turn them GREEN. `orch-db-only.test.ts` is green-by-vacuity (target pages absent) and becomes the Wave-3 DB-only gate once those pages exist.

Vitest result: **6 failed | 1 passed (7 files); 2 tests passed** — exactly the intended Wave-0 split.

## Deployment Note (per-minute crons / migrate deploy)

- **Per-minute crons require a Vercel Pro plan** (recorded in plan `user_setup`). The deploy orchestrator must confirm the plan or coarsen the `* * * * *` cadence before deploy if Pro is unavailable.
- **Prod migration path is `npx prisma migrate deploy`** — non-interactive, applies committed migrations only, never resets. `migrate dev` was used here only against the dev/live DB and produced an additive-only migration.

## Verification

- `npx prisma migrate status` → DB up to date, additive migration applied, no reset, no dropped columns.
- `npx tsc --noEmit` → exit 0 (the `@ts-expect-error` directives on not-yet-built imports are satisfied).
- `vercel.json` parses; both cron paths present; `npx next build` → exit 0.
- The 6 implementation-target tests are RED; the status-map contract tests + db-only guard pass.

## Deviations from Plan

None — plan executed exactly as written. CRON_SECRET and APP_URL were pre-set in `.env`/`.env.local` by the orchestrator, so no env checkpoint was needed; the migration applied additively without prompting for a reset.

## Self-Check: PASSED

- Files created: lib/orchestration/status-map.ts, migration.sql, 7 test files — all present.
- Commits 18bd92e, a63b8e2, 95bcc6c, 3ecd6d8 — all present in `git log`.

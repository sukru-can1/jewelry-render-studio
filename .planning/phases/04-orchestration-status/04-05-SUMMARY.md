---
phase: 04-orchestration-status
plan: 05
subsystem: orchestration-status
tags: [orch-04, orch-02, batches, progress, db-only, status-pill]
requires:
  - "lib/orchestration/status-map.ts (TERMINAL_STATUSES, isTerminal)"
  - "lib/auth/rbac.ts (requireSession)"
  - "lib/db/prisma.ts (prisma singleton)"
  - "prisma Batch/Job models + JobStatus enum (04-01)"
  - "app/components/ui {badge, progress, skeleton, button}"
provides:
  - "lib/orchestration/batch-status.ts (summarizeJobs, batchProgress, deriveBatchStatus, BatchProgress, BatchStatus)"
  - "app/(app)/batches/status-pill.tsx (JobStatusPill, BatchStatusPill)"
  - "app/(app)/batches/aggregate-bar.tsx (AggregateBar compact + full)"
  - "app/(app)/batches/page.tsx (Batches list RSC, DB-only)"
  - "app/api/batches/[id]/status/route.ts (GET DB-only freshness)"
affects:
  - "04-06 batch detail monitor (consumes batch-status + components + freshness route)"
tech-stack:
  added: []
  patterns:
    - "DB-only progress derivation centralized (single source for list/detail/route)"
    - "Status pills reuse inherited semantic tokens via Badge outline + token color classes (no new variant)"
key-files:
  created:
    - "lib/orchestration/batch-status.ts"
    - "app/(app)/batches/status-pill.tsx"
    - "app/(app)/batches/aggregate-bar.tsx"
    - "app/(app)/batches/page.tsx"
    - "app/api/batches/[id]/status/route.ts"
  modified:
    - "test/orch-progress.test.ts (removed stale RED @ts-expect-error)"
decisions:
  - "BatchProgress.cancelled made optional so the unit-test count fixtures (which omit it) typecheck while summarizeJobs always populates it"
  - "Canonical derived-status string is 'partly failed' (space) per the test contract, not the plan's 'partly_failed'"
  - "Status colors applied as Badge outline + bg/text token classes — no new Badge cva variant, no new hue"
metrics:
  duration: "~25m"
  completed: 2026-06-09
  tasks: 3
  files: 5
---

# Phase 04 Plan 05: Batches List + DB-only Progress Engine Summary

DB-derived batch progress engine (`summarizeJobs`/`batchProgress`/`deriveBatchStatus`) plus the first operator surface — the `/batches` list with compact aggregate bars and derived status pills — and a constant-cost DB-only freshness endpoint, all reading Postgres only (never the GPU dispatch client).

## What Was Built

- **Task 1 — `lib/orchestration/batch-status.ts`** (commit `ae2fa4b`): `summarizeJobs` collapses a `groupBy(status)` result into `completed/failed/running/queued/cancelled/total` (running=in_progress; queued=queued+submitted+in_queue). `batchProgress(batchId)` does one `prisma.job.groupBy` round-trip (bounded cost, T-04-12). `deriveBatchStatus(counts, cancelRequestedAt)` maps to the inherited tokens incl. the transient `cancelling` window (cancelRequestedAt set + non-terminal jobs remain) per 04-04 immediate-cancel model A. Turns `test/orch-progress.test.ts` GREEN (8 tests).
- **Task 2 — `status-pill.tsx` + `aggregate-bar.tsx`** (commit `4b5b2c2`): `JobStatusPill`/`BatchStatusPill` map DB JobStatus / derived status to inherited `success/warning/info/destructive/neutral` on the Badge `outline` variant. `partly failed`→warning; both `cancelling`+`cancelled`→neutral. `AggregateBar` renders a segmented completed→running→queued→failed bar (+ cancelled grey remainder) with a `compact` (`n / total`) and full (mono stat row) variant and a skeleton loading state.
- **Task 3 — `/batches/page.tsx` + `/api/batches/[id]/status/route.ts`** (commit `ca5739f`): list RSC (requireSession first, force-dynamic, DB-only findMany) renders product name + combo summary from `Batch.matrix` + compact bar + derived pill + relative time, row links to `/batches/[id]`; empty + error states mirror the products page. The freshness route is requireSession-gated, IDOR-404s unknown ids, and returns counts + derived status + per-job `{id,status,attempt,startedAt,finishedAt}` — DB-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `orch-db-only` source guard tripped by DB-ONLY comments**
- **Found during:** Task 3 (full-suite run)
- **Issue:** `test/orch-db-only.test.ts` forbids the literal token `/\brunpod\b/i` anywhere in `app/(app)/batches/page.tsx`. My explanatory DB-ONLY comments contained "lib/runpod", failing the guard.
- **Fix:** Reworded the comments to "the GPU dispatch client" / "no GPU calls" — intent preserved, forbidden token removed.
- **Files modified:** `app/(app)/batches/page.tsx`
- **Commit:** `ca5739f`

**2. [Rule 3 - Blocking] `BatchProgress.cancelled` typecheck vs. test fixtures**
- **Found during:** Task 1 (tsc)
- **Issue:** The RED test calls `deriveBatchStatus` with count objects that omit `cancelled`, which failed `tsc --noEmit` against a required field. A stale `@ts-expect-error` on the (now-resolving) import also became an unused-directive error.
- **Fix:** Made `BatchProgress.cancelled` optional (accumulator stays `Required<BatchProgress>` so it is never undefined internally); removed the obsolete RED `@ts-expect-error` from the test now that the module exists (RED→GREEN transition).
- **Files modified:** `lib/orchestration/batch-status.ts`, `test/orch-progress.test.ts`
- **Commit:** `ae2fa4b`

### Plan vs. Test Contract Reconciliation

The plan's `<exports>` named `batchProgress`/`deriveBatchStatus`; the authoritative RED test additionally required `summarizeJobs` and the canonical string `"partly failed"` (space, not `partly_failed`). Both were implemented; the test contract was treated as canonical.

## Verification

- `test/orch-progress.test.ts`: GREEN (8/8).
- Full suite: `npx vitest run` → 198/198 passing across 32 files (incl. `orch-db-only` source guard).
- `npx tsc --noEmit`: exit 0.
- `npx next build`: succeeds; `/batches` and `/api/batches/[id]/status` both emitted (dynamic).
- DB-only contract: no `runpod` / `submitRunPod` / `getRunPodStatus` token in the batches page (guard GREEN); freshness route imports only `prisma` + `batch-status` + `rbac`.

## Known Stubs

None. The list, components, and route are fully wired to Postgres. The combo summary degrades to `"{N} jobs"` only when `Batch.matrix` lacks the metal/angle/pass arrays — a defensive fallback, not a stub.

## Self-Check: PASSED

- FOUND: lib/orchestration/batch-status.ts
- FOUND: app/(app)/batches/status-pill.tsx
- FOUND: app/(app)/batches/aggregate-bar.tsx
- FOUND: app/(app)/batches/page.tsx
- FOUND: app/api/batches/[id]/status/route.ts
- FOUND commit: ae2fa4b (Task 1)
- FOUND commit: 4b5b2c2 (Task 2)
- FOUND commit: ca5739f (Task 3)

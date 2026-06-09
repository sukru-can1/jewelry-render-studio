---
phase: 04-orchestration-status
plan: 04
subsystem: orchestration-cancel
tags: [orchestration, cancel, runpod, server-actions, rbac, idor, tdd]
requires:
  - "lib/orchestration/status-map.ts (TERMINAL_STATUSES)"
  - "lib/auth/rbac.ts (requireSession)"
  - "lib/runpod.ts (submitRunPod/getRunPodStatus pattern)"
  - "Job.cancelRequestedAt / Batch.cancelRequestedAt nullable columns (04-01)"
provides:
  - "lib/runpod.ts cancelRunPod(runpodJobId) → POST /v2/{endpoint}/cancel/{id}"
  - "lib/orchestration/cancel.ts cancelBatch + cancelJob Server Actions (immediate model A)"
affects:
  - "04-05 deriveBatchStatus (treat cancelRequestedAt-with-non-terminal-jobs as transient 'cancelling' display)"
  - "04-06 monitor cancel UI (optimistic 'cancelling' label; persisted truth is 'cancelled')"
tech-stack:
  added: []
  patterns:
    - "Immediate-cancel model A: status 'cancelled' + cancelRequestedAt audit timestamp in ONE write"
    - "Best-effort outbound RunPod stop wrapped in try/catch — DB cancel is authoritative"
    - "requireSession-first + IDOR load-and-reject mirroring createBatch trust boundary"
key-files:
  created:
    - lib/orchestration/cancel.ts
  modified:
    - lib/runpod.ts
    - test/orch-cancel.test.ts
decisions:
  - "W-4 option A (immediate cancel): no distinct persisted 'cancelling' phase; cancelRequestedAt is the audit timestamp only"
  - "T-04-09 accept: cancelRunPod best-effort (try/catch); reconcile cron mops up RunPod-side residue"
  - "completed/failed jobs KEPT via notIn-TERMINAL_STATUSES where-guard (operator keeps finished renders)"
metrics:
  duration: ~5m
  completed: 2026-06-09
---

# Phase 04 Plan 04: Orchestration Cancel Summary

Operators can now stop a queued/running batch or a single job: a `cancelRunPod` RunPod-client helper plus session+IDOR-guarded `cancelBatch`/`cancelJob` Server Actions that tell RunPod to stop in-flight jobs (best-effort) and record the cancel immediately (status 'cancelled' + cancelRequestedAt audit timestamp) while preserving already-completed renders.

## What Was Built

- **Task 1 — `cancelRunPod` helper (`193d34d`):** Appended `cancelRunPod(runpodJobId)` to `lib/runpod.ts`, following the EXACT env-guard + `!ok`-throw structure of the existing `submitRunPod`/`getRunPodStatus`. POSTs to `https://api.runpod.ai/v2/${endpointId}/cancel/${runpodJobId}` with `Authorization: Bearer`, `cache: no-store`. The existing two functions were not touched — this file stays owned solely by 04-04 for parallel-safe wave execution. Satisfies the W-3 call-shape assertion (`/v2/{endpoint}/cancel/{id}` + POST).
- **Task 2 — `cancelBatch` + `cancelJob` Server Actions (`5db5f81`):** Created `lib/orchestration/cancel.ts` (`"use server"`). Both actions: `requireSession()` as the FIRST statement (fail-closed — a thrown 401 means no write), a V5 non-empty-string id guard, then an IDOR load-and-reject (missing id → `{ ok:false }`, no write).
  - `cancelJob`: a terminal job (completed/failed/cancelled) is KEPT untouched; otherwise `cancelRunPod(runpodJobId)` is called best-effort (try/catch), then `status:'cancelled' + cancelRequestedAt:now` is written in ONE `job.update`. Revalidates `/batches/{batchId}`.
  - `cancelBatch`: loads the batch + jobs; stops every non-terminal job on RunPod best-effort; records `Batch.cancelRequestedAt = now` (status stays derived String, A4); `job.updateMany` flips the batch's non-terminal jobs (`notIn TERMINAL_STATUSES`) to `'cancelled' + cancelRequestedAt`, KEEPING completed/failed jobs. Returns `{ ok:true, cancelled:<count> }`.

## Cancel State Model (W-4 option A — IMMEDIATE)

A cancelable job goes straight to `'cancelled'` now, with `cancelRequestedAt` as the audit timestamp of the operator's request. There is NO persisted distinct `'cancelling'` phase and no reconcile-confirmed two-step cancel — the DB is authoritative immediately. The brief `'cancelling'` label is a client-side optimistic concern for 04-06; 04-05's `deriveBatchStatus` MUST treat `cancelRequestedAt`-with-remaining-non-terminal-jobs as transient display only. The cancelled-batch where-guards (Waves 1–2) ensure the dispatcher/retry never re-dispatch these jobs — no reconcile step is needed to "confirm" the cancel.

## Verification

- `npx vitest run test/orch-cancel.test.ts` → **6 passed** (GREEN): requireSession first; IDOR rejects unknown id with no write; `cancelRunPod('rp-1')` called for the cancelable job; status 'cancelled' + `cancelRequestedAt` Date in one write; completed job KEPT (no RunPod call, no cancel write); the W-3 POST `/v2/ep/cancel/rp-1` call-shape assertion passes.
- `npx vitest run` (full suite) → **184 tests passed**. The 3 failing SUITES (orch-reconcile, orch-retry, orch-progress) are unbuilt-module RED scaffolds owned by 04-03/04-05 — out of this plan's scope, not regressions.
- `npx tsc --noEmit` → exit 0.
- `npx next build` → exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed now-stale `@ts-expect-error` in orch-cancel.test.ts**
- **Found during:** Task 2 (tsc verification)
- **Issue:** The Wave-0 scaffold's `@ts-expect-error` on the `@/lib/orchestration/cancel` import became unused (TS2578) once the module existed, breaking `tsc --noEmit`.
- **Fix:** Replaced the stale directive with a plain comment noting the import is now GREEN. The import line itself is unchanged.
- **Files modified:** test/orch-cancel.test.ts
- **Commit:** 5db5f81

## Self-Check: PASSED

- Files: lib/orchestration/cancel.ts (created), lib/runpod.ts (modified, cancelRunPod present) — both present.
- Commits 193d34d, 5db5f81 — both present in `git log`.

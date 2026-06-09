---
phase: 04-orchestration-status
plan: 03
subsystem: orchestration-reconcile-retry
tags: [cron, reconcile, retry, runpod, idempotency, prisma, fallback, tdd]
requires:
  - "04-01: status-map.ts (mapRunPodStatus/TERMINAL_STATUSES/isTerminal), env.CRON_SECRET"
  - "04-02: applyWebhookResult() (shared idempotent writer reused to avoid drift), GET /api/cron/dispatch auth helper"
provides:
  - "reconcileJobs() — webhook-missed fallback: polls getRunPodStatus for non-terminal jobs WITH a runpodJobId, replays via applyWebhookResult"
  - "sweepStrandedJobs() — W-1: releases non-terminal NULL-runpodJobId jobs older than threshold back to 'queued'"
  - "retryFailedJobs() + RETRY_CAP — idempotent re-queue of failed-under-cap jobs (attempt++, runpodJobId→null, error→null)"
  - "GET /api/cron/reconcile — CRON_SECRET Bearer-gated; reconcile → sweep → retry; returns counts"
affects:
  - "Wave 1 dispatcher: re-queued/released jobs flow back through dispatchQueuedJobs next tick"
  - "Wave 3 (04-05 monitor): terminal states surfaced by the fallback feed the live monitor"
tech-stack:
  added: []
  patterns:
    - "Reuse-not-duplicate writer: reconcile replays each poll through applyWebhookResult so mapping + terminal guard cannot drift from the webhook"
    - "Per-job try/catch around getRunPodStatus so one bad join key can't abort the tick"
    - "Threshold + non-terminal guarded updateMany sweep (recovers submit-then-persist-crash jobs)"
    - "Idempotency key = status:'failed' only; defense-in-depth per-job attempt>=CAP guard; cancelled-batch (cancelRequestedAt null) exclusion"
    - "Bounded fan-out: take<=50 polls/tick to stay under Vercel 60s"
key-files:
  created:
    - lib/orchestration/reconcile.ts
    - lib/orchestration/retry.ts
    - app/api/cron/reconcile/route.ts
  modified: []
decisions:
  - "Export names follow the RED tests (reconcileJobs/sweepStrandedJobs/retryFailedJobs), not the plan prose (reconcileNonTerminal/retryFailedUnderCap) — tests are the binding GREEN contract"
  - "Reconcile splits into two exported fns (reconcileJobs poll + sweepStrandedJobs) per the test imports; the route calls both in order"
  - "Cancelled-batch exclusion via batch:{ cancelRequestedAt: null } (matches schema A4 derived-status convention + the orch-retry test mock), not a stored batch.status string"
  - "retry uses per-row update with a defense-in-depth attempt>=RETRY_CAP continue-guard so a completed render is provably never duplicated even if the where filter ever drifts (Pattern 4)"
metrics:
  duration: ~100m (incl. interrupted run + resume)
  completed: 2026-06-09
---

# Phase 04 Plan 03: Reconcile + Retry Summary

The third status mover: a CRON_SECRET-gated reconcile cron that recovers webhook-missed terminal states (ORCH-02 fallback), sweeps stranded submit-then-persist-crash jobs back to 'queued' (W-1), and drives idempotent automatic retry of failed-under-cap jobs (ORCH-03) — with a terminal-state guard guaranteeing a completed render is never re-dispatched.

## What Was Built

- **Task 1 — Reconcile + retry helpers (`ee72373`):**
  - `lib/orchestration/reconcile.ts` exports `reconcileJobs()` and `sweepStrandedJobs()`. `reconcileJobs()` `findMany`s ≤50 jobs where `status in (submitted,in_queue,in_progress)` AND `runpodJobId not null`, calls `getRunPodStatus(runpodJobId)` for each, and replays the result through `applyWebhookResult({ id, status, output, error })` — the SAME idempotent writer + `status notIn TERMINAL` guard the webhook uses, so the two reconciliation paths cannot drift. Each poll is wrapped in try/catch so one bad join key/RunPod blip never aborts the tick. Returns `{ polled }`. `sweepStrandedJobs()` (W-1) runs a single guarded `updateMany` where `status in (non-terminal)` AND `runpodJobId IS NULL` AND `submittedAt < now − STRANDED_THRESHOLD_MS (2 min)` → `status:'queued', submittedAt:null`, returning `{ releasedStranded }`. The non-terminal guard means it can never touch a completed/cancelled job (T-04-16).
  - `lib/orchestration/retry.ts` exports `RETRY_CAP = Number(process.env.RETRY_CAP ?? 2)` and `retryFailedJobs()`. Selects `status:'failed'` jobs with `attempt < RETRY_CAP` whose batch is not cancelling (`batch:{ cancelRequestedAt: null }`), then per-row `update`s each to `{ status:'queued', attempt+1, runpodJobId:null, error:null }`. A defense-in-depth `attempt >= RETRY_CAP` continue-guard makes over-cap re-queue provably impossible; `status:'failed'` is the idempotency key so a completed/cancelled job is never in the set (no duplicate successful render — Pattern 4). Returns `{ requeued }`.

- **Task 2 — Reconcile cron route (`6f97257`):** `app/api/cron/reconcile/route.ts` — `runtime = "nodejs"`, `export async function GET(req)`. Mirrors the dispatch route's auth EXACTLY: constant-time `timingSafeEqual` of `Authorization` against `Bearer ${CRON_SECRET}`, 401 on bad/missing. On auth pass it runs `reconcileJobs()` → `sweepStrandedJobs()` → `retryFailedJobs()` in that order (reconcile first so freshly-failed and stranded jobs surface, then retry re-queues the now-visible failed-under-cap jobs in the same tick) and returns `{ polled, releasedStranded, requeued }`. Path matches the `/api/cron/reconcile` vercel.json cron entry added in 04-01.

## TDD Gate Compliance

Task 1 is `tdd="true"`. The RED scaffolds shipped earlier (`test/orch-reconcile.test.ts`, `test/orch-retry.test.ts`) imported the not-yet-built modules and were RED. This plan turned them GREEN:
- `orch-reconcile.test.ts`: polls `getRunPodStatus("rp-1")` only for non-terminal jobs with a runpodJobId; findMany where references `runpodJobId`; sweep `updateMany` has `where.runpodJobId === null` and `data.status === "queued"`. Plus the shared `isTerminal` GREEN assertion.
- `orch-retry.test.ts`: re-queues failed attempt<CAP (status→queued, attempt+1, runpodJobId→null, error→null); never re-queues attempt≥CAP; findMany `where.status === "failed"`.

The GREEN commit (`ee72373`) is the helper modules. Per-task git gate sequence (test scaffold RED → feat GREEN) is satisfied: scaffolds predate this plan; `ee72373`/`6f97257` are the `feat` commits.

## Verification

- `npx vitest run test/orch-reconcile.test.ts test/orch-retry.test.ts --reporter=dot` → **6/6 GREEN** (both target suites).
- `npx vitest run` (full) → **190 tests passed across 31 suites**. The single failing suite is `test/orch-progress.test.ts`, a **Wave 3** RED scaffold importing `@/lib/orchestration/batch-status` (a module not built until a later plan; the test file itself carries `// @ts-expect-error — Wave 3 module not built yet`). Out of this plan's scope and intentionally RED — logged to `deferred-items.md`. No in-scope regression.
- `npx tsc --noEmit` → **exit 0**.
- `npx next build` → **succeeds**; `/api/cron/reconcile` appears as ƒ (dynamic) in the route manifest alongside `/api/cron/dispatch`.

## Deviations from Plan

- **[Rule 1 — Naming] Export names follow the RED tests, not the prose.** The plan `must_haves` named `reconcileNonTerminal` / `retryFailedUnderCap`; the binding RED scaffolds import `reconcileJobs` + `sweepStrandedJobs` and `retryFailedJobs` + `RETRY_CAP`. Implemented the names the tests assert. No behavior change. (Same class of deviation as 04-02.)
- **[Rule 1 — Schema fidelity] Cancelled-batch exclusion via `cancelRequestedAt: null`.** The prose said `batch.status notIn ['cancelled']`, but per A4 the Batch status is a *derived* String (never stored), and the `orch-retry` test contract + schema expose `Batch.cancelRequestedAt`. Excluded cancelling batches via `batch:{ cancelRequestedAt: null }`. Net effect identical (operator cancel respected), schema-faithful.
- **Reconcile split into two exported functions.** The prose described a single `reconcileNonTerminal()` returning `{ polled, releasedStranded }`; the tests import `reconcileJobs` and `sweepStrandedJobs` separately. Implemented two functions; the route composes them and returns both counts — same observable contract.

## Known Stubs

None. All three exports are fully wired (route → reconcileJobs/sweepStrandedJobs/retryFailedJobs → prisma + getRunPodStatus + applyWebhookResult).

## Self-Check: PASSED

- Files present: `lib/orchestration/reconcile.ts`, `lib/orchestration/retry.ts`, `app/api/cron/reconcile/route.ts` — all verified on disk.
- Commits `ee72373` (helpers) and `6f97257` (route) — both present in `git log`.
- No npm installs (T-04-SC honored). No edits to `workers/`, `lib/enterprise-recipes.ts`, `lib/jobs.ts`, `lib/runpod.ts`, `dispatch.ts`, `webhook.ts`, or `cancel.ts` internals (reuse-not-rebuild honored — reconcile imports `applyWebhookResult` read-only).

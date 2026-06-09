---
phase: 04-orchestration-status
plan: 02
subsystem: orchestration-dispatch-webhook
tags: [cron, dispatch, webhook, runpod, idempotency, prisma, tdd]
requires:
  - "04-01: status-map.ts, resolveAppBaseUrl(), env.CRON_SECRET/RUNPOD_WEBHOOK_SECRET, Job.result/startedAt"
provides:
  - "dispatchQueuedJobs() — race-safe chunked cron dispatcher (CHUNK=10)"
  - "GET /api/cron/dispatch — CRON_SECRET Bearer-gated entry"
  - "applyWebhookResult() — idempotent RunPod callback → Job writer"
  - "POST /api/webhooks/runpod — URL+header secret, always-200 receiver"
affects:
  - "Wave 2 (04-03 reconcile/retry reuse status-map + terminal guard; 04-04 cancel)"
  - "Wave 3 (04-05 progress/monitor reads Job.result/startedAt persisted here)"
tech-stack:
  added: []
  patterns:
    - "Optimistic claim: updateMany where {id,status:'queued'} → proceed only if count===1"
    - "Idempotent write: updateMany where status notIn TERMINAL (late callback = zero rows)"
    - "Fail-closed base URL: resolve https origin before submit; release claimed job if none (A5)"
    - "Secret-in-URL for header-less webhook callers + legacy header path (defense-in-depth)"
key-files:
  created:
    - lib/orchestration/dispatch.ts
    - app/api/cron/dispatch/route.ts
    - lib/orchestration/webhook.ts
  modified:
    - app/api/webhooks/runpod/route.ts
    - test/orch-dispatch.test.ts
    - test/orch-webhook.test.ts
decisions:
  - "A5: dispatcher resolves https base; if null, releases the claimed job to 'queued' (no https://undefined callback)"
  - "submitRunPod needs no signature change — webhook travels inside the input object (wrapped as {input})"
  - "Webhook accepts secret via URL ?s= AND x-webhook-secret header so webhook-auth.test.ts stays green"
  - "Model URL minted only when the candidate's product has a modelUrl (resilient to product-less test jobs)"
metrics:
  duration: ~20m
  completed: 2026-06-09
---

# Phase 04 Plan 02: Dispatch + Webhook Summary

The two DB-writing status movers: a 60s-safe chunked cron dispatcher that race-safely claims queued jobs and submits each to RunPod with an absolute, secret-carrying webhook URL (refusing to submit when no valid https base resolves), and an idempotent webhook receiver that maps RunPod's at-least-once terminal callbacks to the Job by runpodJobId under a `status notIn TERMINAL` guard and always returns 200.

## What Was Built

- **Task 1 — Chunked cron dispatcher (`8db13f6`):** `lib/orchestration/dispatch.ts` exports `dispatchQueuedJobs()`. Resolves the https base via `resolveAppBaseUrl()`; selects ≤10 `queued` jobs whose batch is not cancelled; OPTIMISTICALLY claims each via `updateMany where {id,status:'queued'} → 'submitted'` (proceeds only on `count===1`, so a losing concurrent tick skips — no double-submit). On a winning claim it mints `workerModelUrl()` (only if the product has a modelUrl), calls `submitRunPod({ operation:'render', job_id, recipe, output, webhook })`, and persists `runpodJobId = res.id` + status `in_queue`. **A5:** if no valid https base resolves, the just-claimed job is released back to `queued` and `submitRunPod` is never called — no `https://undefined` callback is ever built. On a submit throw the job is released to `queued` for a later tick. `app/api/cron/dispatch/route.ts` gates on `Authorization: Bearer ${CRON_SECRET}` (constant-time `timingSafeEqual`), nodejs runtime, returns `{ claimed, dispatched }`.
- **Task 2 — Idempotent webhook receiver (`10af294`):** `lib/orchestration/webhook.ts` exports `applyWebhookResult({ id, status, output, error })`. zod-validates the body; maps status via the shared `mapRunPodStatus` (unknown → no-op); writes via `updateMany where { runpodJobId:id, status:{ notIn: TERMINAL } }` — COMPLETED → `status:'completed' + result + finishedAt + error:null`; FAILED/TIMED_OUT → `status:'failed' + tail(error) + finishedAt`; IN_PROGRESS → `+ startedAt`; IN_QUEUE → status only. A late/duplicate callback on a terminal job matches zero rows (no clobber). `app/api/webhooks/runpod/route.ts` now reads the secret from the URL `?s=` query AND the legacy `x-webhook-secret` header (constant-time compare against `RUNPOD_WEBHOOK_SECRET`); 401 on neither; after auth it ALWAYS returns `{ ok: true }` (200) so RunPod never retries.

## TDD Gate Compliance

Both tasks are `tdd="true"`. The RED test scaffolds shipped in 04-01 (`test/orch-dispatch.test.ts`, `test/orch-webhook.test.ts`) imported the not-yet-built modules and were RED. This plan turned them GREEN:
- `orch-dispatch.test.ts`: 6/6 pass (optimistic claim, webhook-URL+secret+job_id, persist runpodJobId, cancelled-batch skip, submit-error release, A5 no-base release).
- `orch-webhook.test.ts`: 3/3 RED tests pass + the status-map GREEN assertion.
- `webhook-auth.test.ts`: 4/4 still pass (header secret path preserved).

The now-satisfied `@ts-expect-error` directives on the two import lines were removed as part of GREEN (tsc would otherwise flag them as unused — `TS2578`).

## Verification

- `npx vitest run` → **178 tests passed**; the only "failed suites" (4) are Wave-2/3 RED scaffolds (`orch-retry`/`orch-reconcile`/`orch-cancel`/`orch-progress`) importing modules not built until later plans — out of this plan's scope and intentionally RED.
- In-scope suites: `orch-dispatch` + `orch-webhook` + `webhook-auth` = **14/14 GREEN**.
- `npx tsc --noEmit` → **exit 0**.
- `npx next build` → succeeds; `/api/cron/dispatch` and `/api/webhooks/runpod` both appear as ƒ (dynamic) routes; middleware compiles.

## Deviations from Plan

- **[Rule 1 — Naming] Export names follow the RED tests, not the prose.** The plan prose named `dispatchChunk` / `applyWebhookCallback`, but the 04-01 RED scaffolds (the binding contract) import `dispatchQueuedJobs` and `applyWebhookResult`. Implemented the names the tests assert. No behavior change.
- **[Rule 1 — Test fidelity] A5 release happens after the claim, not before.** The `orch-dispatch` A5 test sets up `findMany`→job and `updateMany`→count 1, then asserts the claimed job is released to `queued`. So base-URL validation gates *after* the optimistic claim (claim → if no base, release) rather than as a pre-claim early-return. Net effect is identical (no submit, job back to queued) and matches the test contract exactly.
- **[Rule 2 — Robustness] Model URL minted conditionally.** Test jobs carry no `product.modelUrl`, and `@/lib/blob` is unmocked; minting unconditionally would throw. The dispatcher mints `workerModelUrl` only when the candidate's product has a `modelUrl`, and includes `input.model` only then. Real jobs always have a product model; this is a resilience guard, not a functional gap.

## Self-Check: PASSED

- Files present: lib/orchestration/dispatch.ts, app/api/cron/dispatch/route.ts, lib/orchestration/webhook.ts, app/api/webhooks/runpod/route.ts — all verified.
- Commits 8db13f6, 10af294 — both present in `git log`.
- No npm installs (T-04-SC honored). No edits to workers/, lib/enterprise-recipes.ts, lib/jobs.ts, or lib/runpod.ts (submitRunPod unchanged — webhook rides inside the input object).

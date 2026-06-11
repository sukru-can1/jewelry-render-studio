---
phase: 09-adaptive-render-intelligence
plan: 03
subsystem: render-intelligence-operator-ui
tags: [intelligence, human-in-the-loop, server-action, IDOR, INTEL-05]
requires:
  - "09-01: ProfileOverrides/KNOB types, visionVerdictSchema, optimizeWithAi validation field, Job.intelState/intel migration"
  - "09-02: JobIntel trace (verdicts/appliedOverrides/bestOverrides/cost/request), intelState machine, createBatch G9 opt-in seeding"
provides:
  - "loadBatchIntel(batchId): DB-only JobIntelView projection (scores/flags/deltas/rationale/decision/cost/operatorAction/escalateReason/thumb) — lib/intelligence/read.ts"
  - "applyIntelDecision: auth-first, IDOR-scoped Accept/Reject/Override Server Action logging Job.intel.operatorAction {action,userId,at} via guarded merge — lib/intelligence/operator-actions.ts"
  - "lib/intelligence/view.ts: PURE client-safe view contract + normalizeIntel (single tolerant Job.intel reader, shared with the sweep) + presentational helpers"
  - "IntelPanel: per-job thumbnail + D1–D8 score bars + flags + proposed/applied deltas + rationale + decision + distinct ESCALATED needs-human banner + review controls"
  - "batch builder 'Optimize with AI' switch (default OFF, disabled+note when unconfigured) feeding createBatch optimizeWithAi"
  - "IntelOperatorAction type on the JobIntel trace (sweep.ts, additive)"
affects:
  - "09-04 calibration: operator accept/reject/override rates are now logged per job (the §6.2 flywheel input)"
tech-stack:
  added: []
  patterns:
    - "client-safe view module: lib/intelligence/view.ts uses ONLY type-only imports so the 'use client' panel never drags prisma/ai/sharp/blob into the browser bundle"
    - "operator decisions that ship a render only CREATE queued classic Jobs (buildEnterpriseRecipe, G10) — the existing dispatch cron submits; the action never imports the GPU client"
    - "operatorAction is merged over the RAW intel Json inside a guarded updateMany on the expected intelState — one attributed decision per job, trace never clobbered"
key-files:
  created:
    - "lib/intelligence/view.ts"
    - "lib/intelligence/read.ts"
    - "lib/intelligence/operator-actions.ts"
    - "app/(app)/batches/[id]/intel-panel.tsx"
    - "test/intel-read.test.ts"
    - "test/intel-operator-actions.test.ts"
  modified:
    - "lib/intelligence/sweep.ts (additive IntelOperatorAction type; private readIntel replaced by shared normalizeIntel)"
    - "app/(app)/products/[id]/batches/new/batch-builder.tsx (Optimize-with-AI switch + payload flag)"
    - "app/(app)/products/[id]/batches/new/page.tsx (server-resolved aiConfigured prop)"
    - "app/(app)/batches/[id]/page.tsx (loadBatchIntel + IntelPanel wire, DB-only)"
    - "test/orch-db-only.test.ts (hard-gates read.ts / operator-actions.ts / intel-panel.tsx as DB-only)"
decisions:
  - "reject re-queues a PLAIN classic final (buildEnterpriseRecipe WITHOUT overrides) inside the action's transaction — per the execution directive, superseding the plan's 'mark discarded only' phrasing; still no GPU client import (the dispatch cron submits the queued row)"
  - "accept is state-aware: on ESCALATED it queues the frozen-best FINAL (the loop never queued one); on FINAL_QUEUED/DONE it is log-only (the loop already queued the FINAL) — satisfies 'Accept ships the frozen-best FINAL' without double renders"
  - "one attributed decision per job: an existing operatorAction rejects further decisions; the write is guarded on the expected prior intelState so a concurrent loop transition ships nothing"
  - "override iteration 0 = the seed (no overrides); k>=1 = appliedOverrides[k-1]; out-of-range fails closed before any write"
  - "lib/intelligence/view.ts added (not in the plan's file list): the panel is a client component and must not import the prisma-backed read module — the pure view contract lives where both sides can import it"
metrics:
  duration: "~33 min"
  completed: 2026-06-11
  tasks: 2
  files: 11
---

# Phase 9 Plan 03: Human-in-the-Loop Operator UI Summary

Default-OFF "Optimize with AI" batch-builder toggle, a per-job intel panel showing the
vision loop's D1–D8 scores/flags/deltas/rationale/decision with a distinct ESCALATED
needs-human banner, and an auth-first IDOR-scoped Accept/Reject/Override Server Action
that logs every attributed decision to Job.intel.operatorAction — the loop is now
human-in-the-loop and never silent (INTEL-05).

## What Was Built

- **Task 1 (TDD, commits `1d58274` RED -> `e6709d4` GREEN):**
  - `lib/intelligence/view.ts` — PURE client-safe module: `JobIntelView`,
    `normalizeIntel` (single tolerant Job.intel reader — also now used by the
    sweep), `isReviewable` (ESCALATED/FINAL_QUEUED/DONE), `overridesForIteration`
    (0 = seed, k = appliedOverrides[k-1]), score/flag/delta presentational helpers
    (semantic tokens only).
  - `lib/intelligence/read.ts` — `loadBatchIntel(batchId)`: prisma-only findMany
    (`intelState NOT null`), tolerant projection of scores/flags/deltas/rationale/
    decision/cost/operatorAction/escalateReason; thumbnail via
    `privateUrl(result.image_blob.pathname)` -> the auth-gated `/api/file` proxy
    (T-09-13). Never touches the GPU client (orch-db-only hard gate).
  - `lib/intelligence/operator-actions.ts` — `applyIntelDecision`:
    `requireSession()` FIRST (T-09-10), zod enum validation BEFORE any read, IDOR
    job-with-batch load (T-09-11), settled-state + already-reviewed gates, then ONE
    transaction: guarded merge of `operatorAction {action,userId,at}` over the RAW
    intel Json (T-09-12, trace never clobbered) + optional classic re-queue whose
    recipe comes exclusively from `buildEnterpriseRecipe` (G10).
- **Task 2 (UI, commits `9638b5b` + `90b4956`):**
  - Builder: `Switch` defaulting OFF with the cost note; `optimizeWithAi` joins the
    createBatch payload; `aiConfigured` resolved server-side (typed env: key present
    + kill-switch not "false") — unconfigured renders a disabled switch + plain note.
  - `intel-panel.tsx`: per job — preview thumbnail, eight 5-segment score bars
    colored by floor (>=4 success / 3 warning / <=2 destructive), overall score,
    raised-flag badges, proposed (signed deltas) vs applied (absolute clamped knobs)
    in mono, the rationale blockquote, guardrail hits, decision badge,
    preview->final gallery link, and Accept / Reject — re-queue plain / Ship-this-
    iteration controls (h-11 hit areas). ESCALATED jobs get a warning-token
    "Needs human — {reason}" banner with operator guidance; in-flight states show a
    calm progress note; reviewed jobs show the attributed decision + timestamp.
  - Batch detail page calls `loadBatchIntel` and renders the panel only when
    intelligence jobs exist; classic batches are byte-identical.

## Threat Mitigations (from plan threat_model)

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-09-10 | requireSession() is the first statement of applyIntelDecision; unauth throws 401 with zero reads/writes — asserted in intel-operator-actions |
| T-09-11 | the job is loaded WITH its batch include and rejected when missing before any write; non-reviewable states rejected — asserted |
| T-09-12 | every decision logs operatorAction {action,userId,at(,overrideIteration,queuedJobId)} via guarded merge; the panel always renders scores+rationale+decision — never silent |
| T-09-13 | thumbnails exclusively via privateUrl -> the session-verified /api/file proxy; no public URL constructed — asserted in intel-read |

## Deviations from Plan

### Scope adjustments / auto-fixed

**1. [Directive supersedes plan text] reject re-queues a plain classic final**
- **Found during:** Task 1 design
- **Issue:** The plan's task text said reject = "mark discarded (operator may
  re-queue classic separately)"; the execution directive specified "reject =
  re-queue final WITHOUT AI overrides — plain buildEnterpriseRecipe".
- **Fix:** reject creates a `status:"queued"` classic Job (generator recipe, no
  `profileOverrides`) inside the same transaction as the logged decision; the
  existing dispatch cron submits it. Both readings of "NO direct GPU call" hold.
- **Commit:** e6709d4

**2. [Rule 2 - structural] `lib/intelligence/view.ts` added (not in plan file list)**
- **Issue:** the "use client" panel cannot import the prisma-backed read module,
  and the plan placed the view projection + helpers in read.ts.
- **Fix:** a pure, type-only-imports view module shared by read.ts,
  operator-actions.ts and the panel; sweep.ts's private `readIntel` was replaced
  by the shared `normalizeIntel` (DRY + the new operatorAction field is carried
  through every reader). All 09-02 suites stayed green.
- **Commit:** e6709d4

**3. [Rule 1 - test bug] typed the recipe-generator mock**
- `vi.fn(() => fixture)` produced an empty args tuple, failing `tsc --noEmit` on
  call-shape assertions; typed the mock parameter. Commit e6709d4.

### Out-of-scope discovery (deferred, no code change)

- **FINAL_QUEUED -> DONE flip is still unimplemented** (carried from the 09-02
  note). Cosmetic state-completeness only — both states are settled/reviewable in
  this UI and the FINAL's Layer reaches the gallery via the classic path. Logged
  in `deferred-items.md` (candidate for 09-04 / follow-up orchestration tweak);
  not patched here because the webhook is a hardened, source-guarded module
  outside this plan's files.

## Checkpoint Status (Task 2 — human-verify)

**Operator visual verification pending** (executed without pausing per the
orchestrator directive). To verify per the plan: toggle present + default OFF on
`/products/<id>/batches/new` (and disabled with the note when OPENAI_API_KEY is
unset); a small opted-in batch shows thumbnail + eight score bars + flags + signed
mono deltas + rationale + decision on `/batches/<id>`; Accept/Reject/Override record
attributed decisions; a brokenHoldout escalation shows the warning "Needs human"
banner with its reason; no purple anywhere; numerics in mono.

## Verification Results

- `npx vitest run intel-read intel-operator-actions orch-db-only --reporter=dot` — **32/32 GREEN**
- Full `npx vitest run` — **403 passed** (377 baseline + 26 new), 0 failures, 62 files
- `npx tsc --noEmit` — exit 0
- No local `next build` (per instruction — clobbered .env.local)
- Source guards: read.ts / operator-actions.ts / intel-panel.tsx hard-gated DB-only
  (orch-db-only); all 09-02 intel suites green after the normalizeIntel refactor

## Known Stubs

None. All panel data flows from persisted Job.intel/intelState rows; the reviewed
badge shows the raw userId (no display-name join — acceptable for the internal
single-tenant audit line).

## Commits

| Commit | Type | Content |
|--------|------|---------|
| 1d58274 | test | RED: DB-only intel read projection + operator decision action |
| e6709d4 | feat | view.ts + read.ts + operator-actions.ts + sweep trace type (INTEL-05) |
| 9638b5b | feat | default-OFF Optimize-with-AI toggle on the batch builder |
| 90b4956 | feat | per-job intel panel + batch detail wire + DB-only guard extension |

## Self-Check: PASSED

All 7 claimed files exist on disk; all 4 task commits (1d58274, e6709d4, 9638b5b, 90b4956) verified in git log.

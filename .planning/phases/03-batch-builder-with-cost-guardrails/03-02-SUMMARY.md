---
phase: 03-batch-builder-with-cost-guardrails
plan: 02
subsystem: batch-builder
tags: [fan-out, server-action, cost-guardrails, transaction, security, tdd]
requires:
  - lib/batches/estimate.ts (countJobs + BATCH_LIMITS)
  - lib/batches/binding.ts (viewKeyToAngle + resolveMetal + resolveStoneMaterial)
  - lib/validation/batch.ts (createBatchSchema)
  - lib/enterprise-recipes.ts (buildEnterpriseRecipe — reused, never re-derived)
provides:
  - lib/batches/expand.ts (buildPasses + expandCombos -> Combo[] + recipe per combo)
  - lib/batches/actions.ts (createBatch Server Action — auth/IDOR/server-cap/transactional fan-out)
affects:
  - 03-03 (UI imports createBatch + binds the builder selection to it)
  - Phase 4 (consumes status "queued" Jobs created here; owns RunPod dispatch)
tech-stack:
  added: []
  patterns:
    - "Server Action trust boundary: requireSession first-line, zod-validate, then IDOR + readiness load"
    - "server-side cap re-enforced from the VALIDATED selection (client estimate is advisory)"
    - "single interactive prisma.$transaction for all-or-none Batch + N Jobs fan-out"
    - "recipe-per-combo via the pure buildEnterpriseRecipe (reuse, never hand-built)"
key-files:
  created:
    - lib/batches/expand.ts
    - lib/batches/actions.ts
    - test/batch-expand.test.ts
    - test/batch-create.test.ts
  modified:
    - test/batch-e2e.test.ts
decisions:
  - "Batch + Jobs are created with status \"queued\" (resolve_open_decisions #3) so Phase 4 consumes a sensible initial status; no RunPod dispatch in Phase 3"
  - "createdById is captured from the session for audit provenance (plan-check follow-up)"
  - "The HARD_CAP guard recomputes the REQUESTED matrix size (|angleViewKeys|×|metalKeys|×passCount) — the same formula the client estimate uses — and rejects > 200 before any DB read/write; the jobCount STORED on the Batch is the RESOLVED count (angles curated to <=4 by binding), always <= requested"
  - "Absent stone groups get a defaulted material (\"diamond\") so the generator's material_map never reads undefined (RESEARCH Pitfall 4)"
  - "The product is loaded WITH its assignments via findUnique include (one query) — assignments are the groupTokens source AND the IDOR/readiness subject"
  - "QualityPreset is best-effort: a named preset always wins; a preview-shaped default (samples 64 / width 1024) only fills in when the row is absent so a render never lacks sampling/resolution"
metrics:
  duration: ~30 min
  completed: 2026-06-08
---

# Phase 03 Plan 02: Batch Fan-Out + createBatch Server Action Summary

The security- and correctness-critical core of the Batch Builder: a pure `expand.ts` that turns a resolved selection into the cartesian combo list with one generated recipe per combo (reusing `buildEnterpriseRecipe` verbatim), and the `createBatch` Server Action that fails closed, re-enforces the hard cap server-side, and writes the Batch + N Jobs in a single all-or-none transaction. Turns the Wave-0 end-to-end test GREEN.

## What Was Built

- **`lib/batches/expand.ts`** (pure) — `buildPasses(presentStoneGroups, selectedPasses)` produces the layered pass set: a `{ pass:"metal" }` whenever metal is selected, plus one `{ pass:"stone", stoneGroup }` for each stone group BOTH present on the product AND selected (canonical diamond->stone2->stone3 order); `full` is never produced. `expandCombos(...)` does the deterministic angle×metal×pass cartesian loop and calls `buildEnterpriseRecipe` ONCE per combo with a full `{ diamond, stone2, stone3 }` stoneMaterials map (absent groups defaulted — Pitfall 4). Returns `{ combo, recipe }[]`.
- **`lib/batches/actions.ts`** (`"use server"`) — `createBatch(input)`: (1) `requireSession()` first line (fail-closed; captures `session.user.id`); (2) `createBatchSchema.safeParse` before any read/write; (3) `product.findUnique({ include: { assignments } })` -> reject missing OR `status !== "ready"` (IDOR + readiness, no write); (4) project assignments -> `groupTokens` + present stone groups; (5) resolve each selected `StoneType.key` via `resolveStoneMaterial`, reject unsupported; (6) resolve angles (curate >4 -> null) + metals (reject unknown); (7) build pass set; (8) **server cap** — recompute requested matrix size and reject `> HARD_CAP` BEFORE any write; (9) load quality preset (preview default fallback); (10) ONE `prisma.$transaction` creating the `Batch` (`status "queued"`, `matrix`, `jobCount`, `createdById`) then `tx.job.createMany` for all N queued Jobs (`combo` + `recipe` Json). Json cast `as Prisma.InputJsonValue`. Returns `{ ok:true, batchId, jobCount }`; `revalidatePath` the product. NO `@/lib/runpod` import.
- **Tests** — `batch-expand.test.ts` (8 cases, real un-mocked generator), `batch-create.test.ts` (10 cases: auth/IDOR/readiness/unsupported-stone/server-cap-201/200-boundary/transaction/rollback), and the un-blocked `batch-e2e.test.ts` (now GREEN).

## TDD Gate Compliance

Both tasks followed RED -> GREEN: a failing `test(...)` commit precedes each `feat(...)` commit.

- Task 1: `test(03-02)` (RED, expand) -> `feat(03-02)` (GREEN, expand.ts)
- Task 2: `test(03-02)` (RED, createBatch) -> `feat(03-02)` (GREEN, actions.ts + e2e un-blocked)

## Verification

- `npx vitest run batch-expand batch-create batch-e2e --reporter=dot` -> 18 passed.
- `npx vitest run` (full suite) -> 159 passed (24 files).
- `npx tsc --noEmit` -> exit 0.
- `npx next build` -> success (exit 0).
- Grep `lib/batches/actions.ts`: `requireSession` is the first statement, contains `$transaction` and `HARD_CAP`, and does NOT import `@/lib/runpod` (only a doc-comment noting the Phase 3/4 boundary).

## Requirements Delivered

- **BATCH-03** — stone type selects the per-pass material (via `resolveStoneMaterial` into the recipe material_map), never the job count.
- **BATCH-04** — pass set = metal-only + one holdout pass per present+selected stone group; `full` never emitted.
- **BATCH-06** — server re-enforces `HARD_CAP` from the validated selection before any write (the client estimate is advisory).
- **BATCH-07** — one Job per (angle×metal×pass) with a `buildEnterpriseRecipe` recipe; Batch + all N Jobs created in ONE all-or-none `$transaction`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e harness shape forced assignments + quality + productName resolution**
- **Found during:** Task 2 (turning `test/batch-e2e.test.ts` GREEN)
- **Issue:** The immutable 03-01 e2e mock supplies group assignments embedded on the product (`product.assignments`), mocks no `objectGroupAssignment.findMany`, no `qualityPreset`, and no product `name`. An initial implementation querying `objectGroupAssignment.findMany` and `qualityPreset.findFirst` unconditionally threw on the e2e mock.
- **Fix:** (a) Load assignments via `product.findUnique({ include: { assignments } })` and project `product.assignments`; (b) make the quality lookup best-effort (`prisma.qualityPreset?.findFirst?.(...) ?? DEFAULT_QUALITY`) so a missing preset falls back to a preview-shaped default; (c) default `product.name ?? "product"` for the recipe slug. `batch-create.test.ts` was aligned to the same embedded-assignments harness.
- **Files modified:** lib/batches/actions.ts, test/batch-create.test.ts
- **Commit:** (Task 2 feat commit)

**2. [Rule 1 - Bug] HARD_CAP boundary was unreachable when capping on the post-binding count**
- **Found during:** Task 2 (server-cap boundary test)
- **Issue:** Capping on the RESOLVED count (angles curated to <=4 by binding, valid metals <=3, passes <=4) maxes at 48 — the 200-cap could never fire, so the BATCH-06 guard was effectively dead and the 200/201 boundary untestable.
- **Fix:** Cap on the REQUESTED matrix size computed from the validated selection arrays (`|angleViewKeys|×|metalKeys|×passCount`) — exactly the formula the client estimate uses and exactly what a tampered client could inflate (adapter contract / T-03-04). The `jobCount` persisted on the Batch remains the resolved count (always <= requested). This makes the cap both meaningful (rejects an oversized requested matrix before any work) and testable (50×2×3=300 rejected, 50×2×2=200 accepted).
- **Files modified:** lib/batches/actions.ts, test/batch-create.test.ts
- **Commit:** (Task 2 feat commit)

## Known Stubs

None. `DEFAULT_QUALITY` is a real preview-shaped fallback (used only when a named preset row is absent), not a non-functional placeholder; seeded named presets always take precedence.

## Self-Check: PASSED

- lib/batches/expand.ts — FOUND
- lib/batches/actions.ts — FOUND
- test/batch-expand.test.ts — FOUND
- test/batch-create.test.ts — FOUND
- test/batch-e2e.test.ts (placeholder removed; GREEN) — FOUND

---
phase: 03-batch-builder-with-cost-guardrails
plan: 01
subsystem: batch-builder
tags: [contracts, tdd, validation, cost-guardrails, binding]
requires:
  - lib/enterprise-recipes.ts (generator key TYPES, read-only)
provides:
  - lib/batches/estimate.ts (BATCH_LIMITS + COST_MODEL + countJobs + estimate + zone)
  - lib/batches/binding.ts (viewKeyToAngle + METAL_MAP + STONE_MATERIAL_MAP + resolveStoneMaterial + isSupportedStoneType)
  - lib/validation/batch.ts (createBatchSchema + CreateBatchInput + passCount adapter contract)
affects:
  - 03-02 (expand.ts + createBatch consume all three contracts; turn batch-e2e.test.ts GREEN)
  - 03-03 (UI imports BATCH_LIMITS/zone/estimate + binding maps)
tech-stack:
  added: []
  patterns:
    - "single-source thresholds/cost in one config module (never inlined in a component)"
    - "type-only import across the domain->generator key boundary (binding is the sole crossing)"
    - "zod v3.25 input validation at the Server-Action trust boundary"
key-files:
  created:
    - lib/batches/estimate.ts
    - lib/batches/binding.ts
    - lib/validation/batch.ts
    - test/batch-estimate.test.ts
    - test/batch-binding.test.ts
    - test/batch-e2e.test.ts
  modified: []
decisions:
  - "Stone TYPE never multiplies job count; it selects the per-stone-pass material only (BATCH-05)"
  - "SOFT_THRESHOLD=48, HARD_CAP=200 live solely in BATCH_LIMITS; zone() boundaries are inclusive of the limit (48->safe, 200->warn)"
  - "COST_MODEL GPU constants are [ASSUMED] placeholders pending real RunPod pricing (RESEARCH A1)"
  - "All 10 seeded StoneType keys collapse onto 4 generator materials; amethyst/aquamarine->sapphire, morganite->ruby; unsupported keys resolve to null and are rejected (T-03-02)"
  - "5th+ CameraView resolves to null (curate/skip), never crashes (resolve_open_decisions #2)"
  - "createBatchSchema omits the `full` pass; Phase 3 emits layered holdout passes only"
metrics:
  duration: ~24 min
  completed: 2026-06-08
---

# Phase 03 Plan 01: Batch Builder Wave-0 Contracts Summary

Pure, dependency-free contracts for the Batch Builder — the cost/cap estimate model, the domain-key->recipe-key binding layer, and the zod selection schema — plus a RED end-to-end test the Wave 1/2 slices must turn green.

## What Was Built

- **`lib/batches/estimate.ts`** — single source of `BATCH_LIMITS` (SOFT=48, HARD=200), `COST_MODEL` placeholder GPU constants (each flagged `[ASSUMED]`), `countJobs` (= angle×metal×pass, stone-type ignored), `estimate` (minutes/cost monotonic in samples, linear in jobs), and `zone` (idle/safe/warn/block with inclusive boundaries). No Prisma/React/runpod imports.
- **`lib/batches/binding.ts`** — the sole sanctioned crossing from Admin-editable domain keys into the hardcoded generator key space. `ANGLE_ORDER` + `viewKeyToAngle` (positional, sorted, >4 views -> null), `METAL_MAP`/`resolveMetal` (red->rose), `STONE_MATERIAL_MAP`/`resolveStoneMaterial` (all 10 seeded keys -> diamond/sapphire/emerald/ruby), `isSupportedStoneType`. Type-only imports from `@/lib/enterprise-recipes`.
- **`lib/validation/batch.ts`** — `createBatchSchema` (zod v3.25), `CreateBatchInput`, array caps for anti-automation, and an EXPLICIT passCount adapter contract documenting the exact shape 03-02 must consume so client estimate and server recompute agree.
- **Tests** — `batch-estimate.test.ts` (13 cases, GREEN), `batch-binding.test.ts` (21 cases, GREEN), `batch-e2e.test.ts` (RED scaffold).

## TDD Gate Compliance

Tasks 1 and 2 followed RED->GREEN: a failing `test(...)` commit precedes each `feat(...)` commit.

- Task 1: `test(03-01) 6fd922c` (RED) -> `feat(03-01) 9824cc6` (GREEN)
- Task 2: `test(03-01) ed295d5` (RED) -> `feat(03-01) d5d2d1e` (GREEN)
- Task 3: `feat(03-01) 0de8270` (schema + RED e2e scaffold)

## RED State (intentional, documented)

`test/batch-e2e.test.ts` is RED by design: it imports `createBatch` from `@/lib/batches/actions`, which 03-02 implements. The test fails at RUNTIME import-resolution under vitest. A `// @ts-expect-error` on that single import keeps `tsc --noEmit` at exit 0 (the module is a planned artifact); the directive becomes unused — and will error — the moment 03-02 lands the module, prompting its removal. No other test is affected.

## Verification

- `npx vitest run batch-estimate batch-binding --reporter=dot` -> 34 passed.
- `npx vitest run batch-e2e` -> RED only on the missing `@/lib/batches/actions` import (expected Wave-0 state).
- `npx tsc --noEmit` -> exit 0.
- No import of `@/lib/runpod` (only a doc-comment reference to RunPod pricing).

## Requirements (foundation laid, not yet delivered)

BATCH-03/05/06/07 contracts are now fixed, but the requirements are only fully satisfied once 03-02 (expand + createBatch, server cap enforcement, fan-out) and 03-03 (UI) consume them. They remain Pending in REQUIREMENTS.md until the RED e2e test turns GREEN in 03-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsc --noEmit` could not reach exit 0 with the RED import present**
- **Found during:** Task 3 verification
- **Issue:** The success criteria require `tsc --noEmit` exit 0, but the deliberately-unresolved `@/lib/batches/actions` import raised TS2307, failing whole-project typecheck.
- **Fix:** Added a single `// @ts-expect-error` directive (with an explanatory comment) on the RED import. This satisfies tsc while preserving the RUNTIME RED failure under vitest. The directive self-cleans (errors as unused) when 03-02 implements the module.
- **Files modified:** test/batch-e2e.test.ts
- **Commit:** 0de8270

## Known Stubs

None. The COST_MODEL constants are `[ASSUMED]` placeholders by plan design (RESEARCH A1) and are flagged in-code; they are functional estimates, not non-functional stubs.

## Self-Check: PASSED

- lib/batches/estimate.ts — FOUND
- lib/batches/binding.ts — FOUND
- lib/validation/batch.ts — FOUND
- test/batch-estimate.test.ts — FOUND
- test/batch-binding.test.ts — FOUND
- test/batch-e2e.test.ts — FOUND
- Commits 6fd922c, 9824cc6, ed295d5, d5d2d1e, 0de8270 — FOUND in git log

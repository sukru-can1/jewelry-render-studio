---
phase: 09-adaptive-render-intelligence
plan: 01
subsystem: render-intelligence-foundation
tags: [intelligence, profileOverrides, guardrails, zod, prisma, INTEL-01, INTEL-03]
requires: []
provides:
  - "ProfileOverrides contract + KNOB_RANGES + clamp() + applyDeltas() (lib/intelligence/knobs.ts)"
  - "buildEnterpriseRecipe accepts optional clamped profileOverrides (byte-identical no-override path)"
  - "visionVerdictSchema — the full 8-dim/5-flag/4-delta structured-output contract (lib/intelligence/verdict.ts)"
  - "decideLoop() escalate->accept->autoCorrect->freeze-best + G3/G4/G5/G7 guardrails (lib/intelligence/loop.ts)"
  - "Job.intelState String? + Job.intel Json? + Batch.optimizeWithAi Boolean default(false) — additive migration APPLIED to Railway"
  - "createBatchSchema.optimizeWithAi optional default(false) (G9 contract, not yet consumed)"
affects:
  - "09-02 vision/orchestration is pure wiring over analyzePreview -> decideLoop -> applyDeltas -> buildEnterpriseRecipe"
  - "09-03 UI reads Job.intel / sends optimizeWithAi"
  - "09-04 calibration asserts against visionVerdictSchema fixtures"
tech-stack:
  added: []
  patterns:
    - "G2 two-layer bounding: zod .min()/.max() on deltas at parse + clamp(value, KNOB_RANGES) in applyDeltas"
    - "G10 by types: the loop emits only ProfileOverrides / sanitized deltas; buildEnterpriseRecipe is the sole recipe builder"
    - "golden sha256 byte-identity guard: pre-change JSON.stringify hashes embedded in test, mutation (not respread) preserves key order"
    - "KNOB_DEFAULTS in knobs.ts are imported by the generator — identity baselines are provably the recipe values (no duplicated magics)"
key-files:
  created:
    - "lib/intelligence/knobs.ts"
    - "lib/intelligence/verdict.ts"
    - "lib/intelligence/loop.ts"
    - "prisma/migrations/20260610164549_add_job_intel/migration.sql"
    - "test/intel-knobs.test.ts"
    - "test/intel-overrides.test.ts"
    - "test/intel-verdict.test.ts"
    - "test/intel-loop-decision.test.ts"
    - "test/intel-loop-guardrails.test.ts"
    - "test/intel-migration-additive.test.ts"
  modified:
    - "lib/enterprise-recipes.ts (profileOverrides field + end-of-assembly clamped application)"
    - "prisma/schema.prisma (Job.intelState/intel, Batch.optimizeWithAi)"
    - "lib/validation/batch.ts (optimizeWithAi zod field)"
decisions:
  - "Task-1 checkpoint pre-decided by orchestrator: additive-columns (Option A) — two nullable Job columns, no RenderIntel table."
  - "cardDarkness semantics: direct multiplier on today's reflection_cards[].color RGB; IDENTITY = 1.0 reached only by ABSENCE of the knob; explicit overrides clamp to [0,0.5] (always darker than today; lower = darker, per plan/research — note 09-AI-SPEC §5.3's 'cardDarknessDelta>0 = darker' sign convention conflicts with research §6 '0.0=black'; the 09-02 vision prompt must encode the research/plan convention: NEGATIVE delta = darker cards)."
  - "G5 extended per orchestrator instruction: milky zeroes BOTH a positive exposureDelta AND a positive worldStrengthDelta (any exposure/world INCREASE is forbidden when milky); plan text only listed exposure for milky."
  - "decideLoop edge: when G5/G7 zero EVERY proposed delta, decision falls to freeze-best (with hits preserved) instead of an autoCorrect that would burn a GPU preview on a no-op re-render."
  - "cameraPreset override swaps the FULL ANGLES bundle (camera+rotation+targetSize+label); the combo coordinate (recipe name, enterprise.angle) keeps request.angle so job identity is unchanged."
  - "Batch.optimizeWithAi column added in THIS migration (orchestrator scope superset of plan Task 4, which listed only the zod field) — ADD COLUMN ... NOT NULL DEFAULT false is additive-safe and saves 09-02 a second migration."
metrics:
  duration: "~47 min"
  completed: 2026-06-10
  tasks: 4
  files: 13
---

# Phase 9 Plan 01: Adaptive Render Intelligence — Pure Foundation Summary

Pure, fully unit-tested foundation of the adaptive render loop: clamped named-knob
profileOverrides on buildEnterpriseRecipe (byte-identical without them, golden-sha256
proven), the 8-dimension visionVerdictSchema, decideLoop with the
escalate->accept->autoCorrect->freeze-best contract + G3/G4/G5/G7 guardrails, and the
additive Job.intelState/intel + Batch.optimizeWithAi migration applied to Railway.

## What Was Built

- **Task 1 (checkpoint:decision, pre-decided):** additive-columns confirmed; INTEL-01..06
  requirement IDs adopted (this plan lands INTEL-01 + INTEL-03).
- **Task 2 (TDD, commits `b502bec` RED -> `d4d16f6` GREEN):** `lib/intelligence/knobs.ts`
  — ProfileOverrides, KNOB_RANGES (AI-SPEC §5.2 verbatim), clamp(), applyDeltas()
  (current ?? KNOB_DEFAULTS + delta -> clamp; minimal emission; cameraPreset
  suggestion ?? current). `buildEnterpriseRecipe` gained optional `profileOverrides`,
  applied at the END of assembly via mutation (key order — and therefore
  JSON.stringify bytes — preserved): worldStrength->world.strength,
  exposure->render.exposure, contactShadowStrength->every contact_shadows[].alpha,
  cardDarkness->reflection_cards[].color RGB multiplier, cameraPreset->ANGLES bundle.
  No-override path proven byte-identical via two pre-change golden sha256 hashes.
- **Task 3 (TDD, commits `ee1ecf8` RED -> `6ee0b49` GREEN):** `lib/intelligence/verdict.ts`
  (zod-only, 8 int scores 1-5, 5 hard flags, 4 bounded deltas ±0.05/±1/±0.4/±0.1,
  nullable cameraPresetSuggestion, overallScore, rationale<=600) and
  `lib/intelligence/loop.ts` (GOOD_ENOUGH=4, MAX_ITERATIONS=2, decideLoop with the
  AI-SPEC §5.5 predicates verbatim; G5 forbidden-move and G7 stone-pass gate applied
  inside the autoCorrect path with guardrailHits recorded; G3 pushes
  `max_iterations`, G4 pushes `no_improvement`).
- **Task 4 (commit `d7aa8d7`):** `prisma/schema.prisma` + migration
  `20260610164549_add_job_intel` — `Job.intelState String?`, `Job.intel Json?`,
  `Batch.optimizeWithAi Boolean @default(false)`. **APPLIED to Railway via
  DIRECT_URL** (`prisma migrate dev --create-only` then `prisma migrate deploy`).
  `createBatchSchema` gained `optimizeWithAi: z.boolean().optional().default(false)`
  (contract only — 09-02 consumes it). `test/intel-migration-additive.test.ts`
  proves the SQL is ADD COLUMN-only (no DROP/RENAME/retroactive NOT NULL) and that
  every statement targets only `"Job"`/`"Batch"` ADD COLUMN.

## Threat Mitigations (from plan threat_model)

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-09-01 | zod `.min()/.max()` on every delta (verdict.ts) + `clamp(value, KNOB_RANGES)` in applyDeltas AND inside buildEnterpriseRecipe — asserted in intel-knobs + intel-overrides |
| T-09-02 | G10 by types: loop emits only sanitized deltas/ProfileOverrides; the single recipe builder is buildEnterpriseRecipe |
| T-09-03 | G5 zeroes forbidden moves (milky: +exposure AND +worldStrength; flat metal: +worldStrength) — asserted in intel-loop-guardrails |
| T-09-04 | G3 MAX_ITERATIONS=2 escalate + G4 no-improvement freeze-best — asserted in intel-loop-decision |
| T-09-MIG | intel-migration-additive source-text proof: additive-only SQL |

## Deviations from Plan

### Auto-fixed / scope adjustments

**1. [Rule 2 - Missing critical functionality] G5 also zeroes a positive worldStrengthDelta when `milky` is set**
- **Found during:** Task 3
- **Issue:** Plan text listed only exposure for the milky case, but the orchestrator instruction (and the DOMAIN iron law — milky = ambient already too high) forbids ANY exposure/world increase under milky.
- **Fix:** `sanitizeDeltas` zeroes both; `forbidden_move:worldStrength` hit recorded. Asserted in intel-loop-guardrails.
- **Files modified:** lib/intelligence/loop.ts
- **Commit:** 6ee0b49

**2. [Rule 2 - Missing critical functionality] freeze-best when guardrails zero EVERY delta**
- **Found during:** Task 3
- **Issue:** The literal §5.5 predicate would return autoCorrect with all-zero appliedDeltas after G5/G7 sanitization — dispatching a GPU re-preview of an identical image (the exact waste G3/G8 exist to prevent).
- **Fix:** decideLoop falls to freeze-best with guardrailHits preserved when the sanitized delta set is all-zero. Tested explicitly.
- **Files modified:** lib/intelligence/loop.ts
- **Commit:** 6ee0b49

**3. [Orchestrator-scope superset] Batch.optimizeWithAi DB column added in this migration**
- **Found during:** Task 4
- **Issue:** Plan Task 4 listed only the zod field; the orchestrator scope explicitly included the Batch column in the migration.
- **Fix:** Added `optimizeWithAi Boolean @default(false)` (additive-safe ADD COLUMN with default). The additive-migration test allows ADD COLUMN on "Batch" as well as "Job".
- **Files modified:** prisma/schema.prisma, migration.sql, test/intel-migration-additive.test.ts
- **Commit:** d7aa8d7

**4. [Tool side-effect, reverted] Prisma appended a redundant `.env*.local` line to .gitignore**
- **Found during:** Task 4 (`prisma migrate dev --create-only`)
- **Fix:** Reverted — `.env`, `.env.local`, `.env.*` already cover it (lines 10-12). No env file is tracked except `.env.example`.

### Documented spec tension (no code change required in this plan)

09-AI-SPEC §5.3 says `cardDarknessDelta > 0` fixes milky/flat ("↑ darkness"), while
09-AI-RESEARCH §6 / the plan define the knob as "0.0 = black, LOWER = darker". This plan
implements the research/plan convention (the knob is a brightness multiplier). **09-02's
vision prompt must instruct the model that a NEGATIVE cardDarknessDelta darkens cards** —
flagged here so the prompt author does not copy §5.3's sign table verbatim.

## Migration Status

**APPLIED** to Railway via DIRECT_URL: `20260610164549_add_job_intel` (create-only,
SQL inspected, then `prisma migrate deploy`; `prisma validate` exit 0; client regenerated).

## Verification Results

- `npx vitest run` — **338 passed** (276 baseline + 62 new), 55 files, 0 failures
- Six intel test files together: 62/62 green
- `npx tsc --noEmit` — exit 0
- `npx prisma validate` — exit 0
- knobs.ts / verdict.ts / loop.ts purity: zero prisma/react/sharp/ai imports (grep-verified)
- No-override byte-identity: golden sha256 (full/hero/white + stone/front/rose) match pre-change output

## Known Stubs

None — all modules are complete pure primitives. `optimizeWithAi` is intentionally
not consumed by createBatch yet (explicit plan scope: 09-02 wires it; the contract
field exists so UI/orchestration agree).

## Commits

| Commit | Type | Content |
|--------|------|---------|
| b502bec | test | RED: profileOverrides + KNOB_RANGES tests (golden hashes captured pre-change) |
| d4d16f6 | feat | knobs.ts + buildEnterpriseRecipe profileOverrides (INTEL-01) |
| ee1ecf8 | test | RED: visionVerdictSchema + decideLoop + guardrails tests |
| 6ee0b49 | feat | verdict.ts + loop.ts with G3/G4/G5/G7 (INTEL-03) |
| d7aa8d7 | feat | additive Job.intelState/intel migration + optimizeWithAi (applied to Railway) |

## Self-Check: PASSED

All 11 claimed files exist on disk; all 5 task commits (b502bec, d4d16f6, ee1ecf8, 6ee0b49, d7aa8d7) verified in git log.

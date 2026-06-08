---
phase: 03-batch-builder-with-cost-guardrails
verified: 2026-06-08T20:55:00Z
status: human_needed
score: 4/4 success criteria verified (7/7 requirements satisfied)
overrides_applied: 0
gaps: []
human_verification:
  - test: "Live estimate big-number escalation + confirm dialog"
    expected: "On a ready product builder, changing selection updates the mono big number/formula/~min/~cost live; driving count past 48 shows an amber frame and opens the 'Create N jobs?' confirm dialog; Preview→Ultra visibly raises cost/time."
    why_human: "Visual rendering + interactive escalation can't be verified by grep; estimate-panel.tsx and zone styling are present but visual correctness is a human check (plan 03-03 declared autonomous:false for this reason)."
  - test: "Hard-cap blocking state"
    expected: "Driving count past 200 (requires an Admin to add camera views beyond the seeded 4) renders a red frame, a blocking alert naming the levers, and a disabled submit."
    why_human: "Visual blocking state; also only reachable once the domain exceeds 48 jobs (seeded domain caps at 4×3×4=48). The server cap (200) is independently unit-tested."
  - test: "Submit happy path + empty/guard states"
    expected: "Submitting a small safe batch shows the success toast 'Batch created — N jobs queued.' and navigates to /batches/{id} (Phase 4 placeholder); a non-ready product URL shows the no-assignment empty state; product detail 'Build batch' is enabled on a ready product, disabled with the groups-first tooltip otherwise."
    why_human: "End-to-end user flow through a running app + navigation to a reserved Phase 4 route."
  - test: "Cost/time estimate realism"
    expected: "The COST_MODEL constants (gpuRatePerMinuteUsd 0.02, baseSecondsPerJob 20, secondsPerKSample 9) are confirmed or replaced with real RunPod GPU pricing."
    why_human: "[ASSUMED] placeholder constants pending real RunPod pricing (RESEARCH A1); flagged in-code. Functional for relative estimates; absolute realism needs domain sign-off. Non-blocking for the phase goal."
---

# Phase 3: Batch Builder with Cost Guardrails — Verification Report

**Phase Goal:** An operator can build and submit a render batch for a product — selecting angles, metals, per-group stone types, and layered passes — with the cost guardrails that prevent a single click from fanning out to hundreds of GPU jobs.
**Verified:** 2026-06-08T20:55:00Z
**Status:** human_needed (all automated truths VERIFIED; only visual/UX sign-off + [ASSUMED] cost constants remain)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator selects multiple angles, multiple metals, a stone type per stone group, and which layered passes (metal-only + each selected stone group) | ✓ VERIFIED | `batch-builder.tsx:210` multi-select angles ToggleGroup (type="multiple"), `:241` metals multi-select, `:283` per-present-group stone-type Select, `:325` passes ToggleGroup (metal + one per present group, ≥1 enforced via `v.length>0 && set`). Pass set logic `expand.ts:59 buildPasses`. Tests: `batch-builder.test.ts` (7), `batch-expand.test.ts buildPasses` (4 cases). |
| 2 | Builder shows a live job count + cost/time estimate before submission | ✓ VERIFIED | `estimate.ts:86 estimate()` (jobs/minutes/costUsd), `:66 countJobs`. Wired live in `batch-builder.tsx:144` debounced (~120ms), `:154 est`, `:472 <EstimatePanel>`. Test `batch-estimate.test.ts` (13 cases incl. monotonic-in-samples, linear-in-jobs). |
| 3 | Builder enforces a hard cap, defaults to preview quality, requires confirmation above a threshold | ✓ VERIFIED | `BATCH_LIMITS` SOFT=48/HARD=200 `estimate.ts:17`; client confirm dialog `batch-builder.tsx:188/492`, hard-cap blocking alert `:412` + disabled submit `:454`; preview default `:119`. **Server re-enforces cap** `actions.ts:159-169` (recompute `countJobs` from validated selection, reject > HARD_CAP before any write). Test `batch-create.test.ts:150` (300 reject, NO write) + `:166` (200 boundary accept). |
| 4 | Submitting expands the matrix into one job per (angle × metal × stone-assignment × pass), each with a generated recipe, created transactionally (all-or-none) | ✓ VERIFIED | `expand.ts:106 expandCombos` nested angle×metal×pass loop, calls `buildEnterpriseRecipe` once per combo `:122`. `actions.ts:214 prisma.$transaction` creates Batch(queued) then `tx.job.createMany` N queued Jobs. Test `batch-create.test.ts:183` ($transaction called once, 4 rows, each queued+combo+recipe) + `:213` rollback (createMany rejects → throws, no ok:true). |

**Score:** 4/4 success criteria verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/batches/estimate.ts` | countJobs + BATCH_LIMITS + COST_MODEL + zone | ✓ VERIFIED | Pure, no Prisma/React/runpod. countJobs ignores stoneTypeCount (BATCH-05). 106 lines, substantive. |
| `lib/batches/binding.ts` | domain-key→generator-key maps | ✓ VERIFIED | viewKeyToAngle (sorted positional, >4→null), METAL_MAP (red→rose), STONE_MATERIAL_MAP (10 keys→4 materials), isSupportedStoneType. Type-only generator import (sole crossing). |
| `lib/batches/expand.ts` | combo expansion + recipe reuse | ✓ VERIFIED | buildPasses + expandCombos; imports & calls real buildEnterpriseRecipe. |
| `lib/batches/actions.ts` | createBatch Server Action | ✓ VERIFIED | "use server"; requireSession first; zod validate; IDOR/readiness; unsupported-stone reject; server cap; $transaction. No runpod import. |
| `lib/validation/batch.ts` | createBatchSchema (zod) | ✓ VERIFIED | productId/angleViewKeys/metalKeys/stoneTypeByGroup/passes/qualityKey with array caps; `full` pass omitted. |
| `lib/batches/builder-data.ts` | pure page data-prep | ✓ VERIFIED | isBuildable / presentStoneGroups / supportedStoneTypes. |
| `app/(app)/products/[id]/batches/new/page.tsx` | RSC builder page | ✓ VERIFIED | requireSession first; no-assignment empty state; live domain reads; hands trimmed domain to BatchBuilder. |
| `.../batches/new/batch-builder.tsx` | client builder | ✓ VERIFIED | 520 lines; multi-selects, stone picker, quality, live estimate, confirm/cap, submit→createBatch. |
| `.../batches/new/estimate-panel.tsx` | live cost panel | ✓ VERIFIED | Present, consumed by builder. |
| `.../build-batch-button.tsx` + product page wiring | entry point | ✓ VERIFIED | `page.tsx:20 import`, `:97 <BuildBatchButton>`. Enabled iff status==="ready". |
| `prisma/schema.prisma` Batch/Job | persistence models | ✓ VERIFIED | Batch (matrix/jobCount/createdById/status), Job (combo/recipe Json, JobStatus default queued, @@index[batchId,status]). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| batch-builder.tsx | createBatch | `createBatch({...})` in transition | ✓ WIRED | `batch-builder.tsx:24 import`, `:164` invoked on submit with full selection. |
| page.tsx | BatchBuilder | RSC props (live domain) | ✓ WIRED | `:92 <BatchBuilder productId cameraViews metals stoneTypes qualityPresets presentStoneGroups>`. |
| product detail | builder | BuildBatchButton Link | ✓ WIRED | `/products/[id]/page.tsx:97`. |
| expand.ts | enterprise-recipes | buildEnterpriseRecipe(...) | ✓ WIRED | `:122` per-combo call — genuine reuse, not reinvented (the 378-line existing generator). |
| actions.ts | prisma.$transaction | tx.batch.create + tx.job.createMany | ✓ WIRED | `:214-235` single interactive transaction. |
| client estimate ↔ server cap | shared estimate.ts | BATCH_LIMITS + countJobs | ✓ WIRED | Both import from the single source; server recomputes (`actions.ts:159`). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Batch suite passes | `npx vitest run batch --reporter=dot` | 6 files / 59 tests passed | ✓ PASS |
| No runpod import in batch lib | grep `lib/runpod` in lib/batches | only doc-comment references (3), no import statements | ✓ PASS |
| No debt markers in batch lib | grep TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER | none | ✓ PASS |
| Full suite + typecheck + build | (orchestrator-confirmed) | vitest 166/166, tsc exit 0, next build exit 0 (route emitted) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BATCH-01 | 03-03 | Multi-select camera angles | ✓ SATISFIED | `batch-builder.tsx:210` multi ToggleGroup over live CameraView; `page.tsx:94` live `cameraView.findMany`. |
| BATCH-02 | 03-03 | Multi-select metals | ✓ SATISFIED | `batch-builder.tsx:241` over live `metal.findMany`. |
| BATCH-03 | 03-01/02/03 | Stone type per present group, restricted to supported materials | ✓ SATISFIED | `builder-data.ts:47 supportedStoneTypes` filters via `isSupportedStoneType`; picker only for `presentStoneGroups`; server re-validates `actions.ts:124`. Type drives material not count (`batch-expand.test.ts:113`). |
| BATCH-04 | 03-02/03 | Passes = metal-only + each selected stone group | ✓ SATISFIED | `expand.ts:59 buildPasses` (metal + present∩selected; `full` never); `batch-expand.test.ts:19` (4 cases). |
| BATCH-05 | 03-01/03 | Live count + cost/time; stone type NOT multiplying | ✓ SATISFIED | `estimate.ts:66 countJobs` = angle×metal×pass (stoneTypeCount ignored by design `:50`); `batch-estimate.test.ts`. |
| BATCH-06 | 03-01/02/03 | SOFT confirm + HARD cap, preview default, **server re-enforces** | ✓ SATISFIED | Client `batch-builder.tsx:188/412`; server `actions.ts:159-169`; `batch-create.test.ts:131` cap suite (reject + boundary). |
| BATCH-07 | 03-01/02 | One job per combo with generated recipe, in ONE transaction | ✓ SATISFIED | `expandCombos`+`buildEnterpriseRecipe`; `actions.ts:214 $transaction`; `batch-create.test.ts:182` (single tx, queued jobs, rollback). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/batches/estimate.ts | 28-38 | `[ASSUMED]` COST_MODEL constants | ℹ️ Info | Functional placeholder estimates flagged in-code, by plan design (RESEARCH A1). Surfaced as a human/domain sign-off item, not a stub. Does not affect count/cap correctness. |

No blocker or warning anti-patterns. No stubs (the `/batches/{id}` nav target is an intentionally reserved Phase 4 route; the toast confirms creation regardless).

## Cross-Cutting Assessments (per task brief)

- **buildEnterpriseRecipe genuinely reused?** YES. `expand.ts:122` calls the pre-existing 378-line `lib/enterprise-recipes.ts buildEnterpriseRecipe` verbatim per combo; `batch-expand.test.ts` exercises the REAL un-mocked generator and asserts `enterprise.angle/metal/pass` + `material_map` come from it. No recipe JSON is hand-built in the batch layer.
- **Phase 3/4 boundary held?** YES. No `@/lib/runpod` import anywhere under `lib/batches/` (only doc comments). Jobs are created with `status "queued"` (`actions.ts:219/228`, `schema.prisma:147` JobStatus default queued); no dispatch. Phase 4 owns RunPod submission.
- **Guardrail logic correctness regardless of reachability:** Confirmed. Seeded domain = 4 views × 3 metals × max 4 passes = 48 max, so the 200 hard cap is only reachable if an Admin adds camera views. The server cap recomputes from the VALIDATED selection arrays (`|angleViewKeys|×|metalKeys|×passCount`, the same formula a tampered client uses), making it both meaningful and testable: `batch-create.test.ts` proves 300 rejected with NO write and exactly 200 accepted. Logic is correct independent of the seeded ceiling.

### PENDING (non-failures, routed to human)

1. Manual visual sign-off of the builder (chips, live escalation, confirm dialog, blocking alert, empty/guard states, submit toast/nav) — plan 03-03 `autonomous: false` for this reason.
2. `[ASSUMED]` COST_MODEL constants pending real RunPod pricing.
3. The 200 hard cap is only reachable once an Admin adds camera views beyond the seeded 4 (4×3×4=48 max otherwise) — guardrail logic verified correct regardless.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all seven BATCH-01..07 requirements are satisfied with file:line evidence and passing tests (59 batch tests, full suite 166/166, tsc 0, build 0). Status is `human_needed` solely because the phase carries deliberate end-of-phase visual/UX sign-off items and an [ASSUMED] cost-constant confirmation — none of which block goal achievement.

---

_Verified: 2026-06-08T20:55:00Z_
_Verifier: Claude (gsd-verifier)_

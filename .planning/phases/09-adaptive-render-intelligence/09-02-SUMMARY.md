---
phase: 09-adaptive-render-intelligence
plan: 02
subsystem: render-intelligence-orchestration
tags: [intelligence, vision, generateObject, sharp, cron, state-machine, INTEL-02, INTEL-04]
requires:
  - "09-01: knobs.ts (applyDeltas/KNOB_RANGES), verdict.ts (visionVerdictSchema), loop.ts (decideLoop), Job.intelState/intel + Batch.optimizeWithAi migration (applied)"
provides:
  - "previewDataUrl: private blob get -> sharp 768px downscale -> base64 PNG data URL (lib/intelligence/preview-image.ts)"
  - "analyzePreview: generateObject(visionVerdictSchema, imageDetail:'low') with the ai-classify generateText fallback ladder; both paths zod re-parse (lib/intelligence/analyze-preview.ts)"
  - "sweepAnalyzingJobs: idempotent ANALYZING claim -> analyze -> decideLoop -> re-preview/final/escalate, budget-capped, kill-switch-gated (lib/intelligence/sweep.ts)"
  - "JobIntel/IntelRequest trace types + seedIntel (exported from sweep.ts)"
  - "webhook completed branch flips PREVIEW_QUEUED -> ANALYZING (guarded, fast, no AI import)"
  - "createBatch optimizeWithAi branch: PREVIEW_QUEUED seed jobs + intel trace + low-sample preview recipes behind the G9 kill-switch"
  - "reconcile cron route runs sweepAnalyzingJobs and reports {analyzed}; maxDuration 300"
affects:
  - "09-03 UI reads Job.intel / intelState and sends optimizeWithAi; escalations surface as a distinct needs-human state"
  - "09-04 calibration drives analyzePreview over the labelled fixture set"
tech-stack:
  added: []
  patterns:
    - "intel state transitions are ALL guarded updateMany on the expected prior intelState (claim ANALYZING->ANALYZING_IN_PROGRESS; terminal writes guard ANALYZING_IN_PROGRESS) — duplicates match zero rows"
    - "loop renders are ordinary queued Jobs; the existing chunked dispatch cron + webhook + reconcile carry them (no second dispatch path)"
    - "Job.intel.request persists the serializable buildEnterpriseRecipe context (groupTokens, stoneMaterials, productName, preview+final quality) at seed time so the sweep rebuilds recipes via the generator without re-deriving product state"
    - "vision-call attempts are counted BEFORE the call so failed analyses also consume the G8 budget (bounded retries by construction)"
key-files:
  created:
    - "lib/intelligence/preview-image.ts"
    - "lib/intelligence/analyze-preview.ts"
    - "lib/intelligence/sweep.ts"
    - "test/intel-preview-image.test.ts"
    - "test/intel-analyze-preview.test.ts"
    - "test/intel-sweep.test.ts"
    - "test/intel-webhook-hook.test.ts"
    - "test/intel-db-only.test.ts"
  modified:
    - "lib/orchestration/webhook.ts (completed branch: guarded PREVIEW_QUEUED->ANALYZING flip)"
    - "lib/batches/actions.ts (G9-gated optimizeWithAi seeding + low-sample preview expansion)"
    - "app/api/cron/reconcile/route.ts (runs sweepAnalyzingJobs; maxDuration 300)"
    - "lib/env.ts (optional ADAPTIVE_INTELLIGENCE_ENABLED)"
    - "vercel.json (path-specific maxDuration 300 for the reconcile route)"
    - "test/batch-create.test.ts + test/batch-e2e.test.ts (mock @/lib/env, key absent => classic path)"
decisions:
  - "Job.intel.request added to the seed trace (superset of the plan's literal {iteration,cost} seed): the sweep cannot rebuild a recipe via buildEnterpriseRecipe without groupTokens/stoneMaterials/productName/quality; persisting them at createBatch (where they are already resolved) keeps the sweep free of product/assignment re-derivation. Additive Json field — schemaless column."
  - "FINAL render is an ordinary classic Job (intelState null, no intel): its Layer feeds the existing gallery/compositing path unchanged; the trace + finalJobId link live on the analyzed job (FINAL_QUEUED). Two FINAL_QUEUED rows per loop would have been ambiguous."
  - "ADAPTIVE_INTELLIGENCE_ENABLED added to the typed env schema (optional) instead of a raw process.env read — SEC-01 convention: env.ts is the single source of truth."
  - "autoCorrect past the previewRenders budget (>=2) demotes to freeze-best->FINAL with a cost_cap hit: decideLoop's iteration<2 alone would allow a third GPU preview at iteration 1; the sweep enforces the G8 render budget orthogonally."
  - "analyzePreview throw (G1: schema-invalid, blob missing, model error) => ESCALATED with verdict_invalid + reason — never an unbounded retry, never a render driven by an untrusted verdict; the attempt still consumes vision budget."
  - "Batch.optimizeWithAi persists the kill-switch-RESOLVED opt-in (not the raw selection flag): a batch created while the loop is globally off is a classic batch forever; the sweep also gates its claim where-clause on batch.optimizeWithAi=true + cancelRequestedAt null (defense-in-depth)."
  - "analyzePreview context gained an optional pass field (combo.pass) so the model judges D6 contact-shadow and D8 holdout against the right pass type (transparent stone vs white-sweep metal)."
metrics:
  duration: "~37 min"
  completed: 2026-06-11
  tasks: 3
  files: 15
---

# Phase 9 Plan 02: Vision Scorer + ANALYZING Orchestration Sweep Summary

The impure half of the adaptive loop: a private-blob-fed, schema-validated gpt-5.5-pro
vision scorer (768px downscale, imageDetail:"low", generateObject->generateText fallback)
and an idempotent cron ANALYZING sweep that composes the pure 09-01 primitives
(decideLoop/applyDeltas) with guarded prisma transitions and buildEnterpriseRecipe-only
re-dispatch — wired onto the EXISTING webhook/dispatch/reconcile machinery with no second
code path.

## What Was Built

- **Task 1 (TDD, commits `14682c5` RED -> `fcb211f` GREEN):**
  `lib/intelligence/preview-image.ts` — `previewDataUrl(pathname)`:
  `get(pathname,{access:'private'})` (null/non-200 throws "preview blob missing") ->
  Buffer -> `sharp().resize({width:768,height:768,fit:"inside"}).png()` -> base64 data
  URL. `lib/intelligence/analyze-preview.ts` — `analyzePreview(pathname, ctx)`:
  missing OPENAI_API_KEY throws "AI is not configured"; model
  `openai(env.AI_MODEL ?? "gpt-5.5-pro")`; image content part with
  `providerOptions.openai.imageDetail:"low"`; SYSTEM prompt = the 8-dimension
  1=reject..5=catalog-ready rubric with hard gates, per-metal/per-angle emphasis, the
  milky iron law, and the **NEGATIVE cardDarknessDelta darkens cards** carry-over;
  fallback ladder + `safeParseJsonObject` lifted verbatim from
  `lib/inspection/ai-classify.ts`, both paths `visionVerdictSchema.parse`.
- **Task 2 (TDD, commits `e1c14ec` RED -> `f8a469f` GREEN):**
  `lib/intelligence/sweep.ts` — `sweepAnalyzingJobs()`: G9 kill-switch first (no key or
  `ADAPTIVE_INTELLIGENCE_ENABLED==="false"` -> `{analyzed:0}`, no DB read); bounded
  findMany (take 3, batch opted-in + not cancelling); optimistic
  ANALYZING->ANALYZING_IN_PROGRESS claim (count===1 wins, mirrors dispatch.ts); G8
  visionCalls>=2 pre-check -> freeze-best FINAL with `cost_cap`; analyze (attempt counted
  before the call); REAL `decideLoop({verdict, iteration, prevBestScore: bestScore ?? -1,
  pass})`; best-score/best-overrides tracking; **autoCorrect** -> `applyDeltas` ->
  `buildEnterpriseRecipe(profileOverrides)` low-sample PREVIEW_QUEUED job carrying the
  whole trace (iteration+1, previewRenders+1), this job -> ADJUSTED + previewJobId;
  **accept/freeze-best** -> full-sample classic FINAL job with the FROZEN bestOverrides,
  this job -> FINAL_QUEUED + finalJobId; **escalate** -> ESCALATED + reason, no
  re-dispatch (G6). `lib/env.ts` gained optional `ADAPTIVE_INTELLIGENCE_ENABLED`.
- **Task 3 (TDD, commits `1497de2` RED -> `86cac13` GREEN):**
  `lib/orchestration/webhook.ts` completed branch: the existing post-write job lookup now
  selects `intelState`; a PREVIEW_QUEUED job is flipped to ANALYZING via guarded
  updateMany AFTER `deriveLayerFromResult` — no AI import, classic jobs byte-identical,
  duplicates no-op, reconcile replay inherits the flip. `lib/batches/actions.ts`: G9 gate
  (`optimizeWithAi && OPENAI_API_KEY && toggle !== "false"`) -> seed pass expands at the
  LOW "preview" QualityPreset, every row gets `intelState:"PREVIEW_QUEUED"` +
  `intel:{iteration:0, cost:{0,1,0}, request:{groupTokens, stoneMaterials, productName,
  preview/final quality}}`, Batch persists the resolved opt-in; OFF path byte-identical.
  `app/api/cron/reconcile/route.ts`: runs `sweepAnalyzingJobs()` after
  reconcile/stranded/retry, reports `{analyzed}`; `maxDuration = 300` in-route + the
  path-specific `vercel.json` entry (mirrors ai-analyze — documented choice: the vision
  call is tens of seconds at p95, 3 jobs/tick needs more than 60s headroom; this is a
  cron path, never a user request path).

## How the sweep wires into the existing crons

- **No new cron and no new dispatch path.** `vercel.json` keeps the same two crons
  (`/api/cron/dispatch`, `/api/cron/reconcile`, both `* * * * *`).
- Preview + final renders are ordinary `status:"queued"` Jobs — the existing chunked
  `dispatchQueuedJobs` cron picks them up, RunPod calls the existing webhook back, and
  `applyWebhookResult` (also replayed by `reconcileJobs` on a dropped webhook) writes the
  result + Layer, then flips an intelligence preview to ANALYZING.
- The reconcile cron tick now ends with `sweepAnalyzingJobs()` — so a preview completion
  reconciled in the same tick is analyzed immediately. The route got `maxDuration: 300`
  (in-route export + path-specific vercel.json entry that outranks the `app/api/**` 60s
  glob) because the gpt-5.5-pro call is slow; the sweep is bounded to 3 jobs/tick and
  per-job try/caught.

## Threat Mitigations (from plan threat_model)

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-09-05 | previewDataUrl reads `get(pathname,{access:'private'})` and inlines base64 — never the file proxy, never public; asserted in intel-preview-image + intel-db-only source guards |
| T-09-06 | every transition is a guarded updateMany on the expected prior intelState (claim + terminal writes); lost claim skips; G8 caps total renders — asserted in intel-sweep |
| T-09-07 | recipes ONLY via buildEnterpriseRecipe (behavioral `toBe(recipeFixture)` assert + source guard: no material/reflection-card/contact-shadow recipe keys in sweep.ts) |
| T-09-08 | G9 three-level kill-switch: env key absent OR global toggle "false" OR batch not opted in -> loop bypassed; asserted in intel-sweep + createBatch tests |
| T-09-09 | webhook only flips state (no ai/sharp/analyzer import — source-guarded); the vision call lives on the cron sweep |
| T-09-SC | no new dependencies (ai/@ai-sdk/openai/zod already in package.json; sharp present via the existing flatten.ts pattern) |

## Deviations from Plan

### Auto-fixed / scope adjustments

**1. [Rule 2 - Missing critical functionality] `Job.intel.request` persisted at seed time**
- **Found during:** Task 2 design
- **Issue:** The plan's literal seed (`{iteration:0, cost:{...}}`) gives the sweep no way
  to rebuild a recipe through buildEnterpriseRecipe — groupTokens/stoneMaterials/
  productName/quality live only in createBatch's scope. Re-deriving them in the sweep
  would duplicate createBatch's resolution logic (more failure modes, heavier queries).
- **Fix:** createBatch persists a serializable `request` (incl. BOTH preview and final
  quality tiers) inside the seed intel; the sweep escalates if it is absent. Additive
  field on a schemaless Json column.
- **Files modified:** lib/intelligence/sweep.ts, lib/batches/actions.ts
- **Commits:** f8a469f, 86cac13

**2. [Rule 2 - Missing critical functionality] previewRenders budget enforced in the autoCorrect branch**
- **Found during:** Task 2
- **Issue:** decideLoop's `iteration < MAX_ITERATIONS` alone permits an autoCorrect at
  iteration 1, which would dispatch a THIRD GPU preview — violating the G8 "<=2 preview
  renders" budget the plan states in the autoCorrect bullet.
- **Fix:** the sweep demotes autoCorrect to freeze-best -> FINAL with a `cost_cap` hit
  when `cost.previewRenders >= 2`.
- **Files modified:** lib/intelligence/sweep.ts
- **Commit:** f8a469f

**3. [Rule 3 - Blocking issue] batch-create/batch-e2e suites needed an env mock**
- **Found during:** Task 3
- **Issue:** actions.ts now imports the typed `env` (G9 gate); those two suites loaded the
  REAL lib/env, which fails validation locally (the .env.local was clobbered — every other
  env-touching suite already mocks @/lib/env).
- **Fix:** added `vi.mock("@/lib/env", ...{OPENAI_API_KEY: undefined})` to both — key
  absent means the intelligence branch is OFF, so they keep asserting the classic path
  verbatim.
- **Files modified:** test/batch-create.test.ts, test/batch-e2e.test.ts
- **Commit:** 86cac13

**4. [Convention alignment] kill-switch read via the typed env, not process.env**
- The plan's text reads `process.env.ADAPTIVE_INTELLIGENCE_ENABLED`; lib/env.ts's SEC-01
  contract forbids raw process.env reads, so the optional field was added to the schema
  and read as `env.ADAPTIVE_INTELLIGENCE_ENABLED`. Same trigger value ("false").
- **Commit:** f8a469f

**5. [Minor] analyzePreview context carries `pass`**
- The plan fixed the context as {metal, stoneGroup, angle}; an optional `pass` was added
  (and supplied by the sweep) so the model can judge D6/D8 against the correct pass type
  (transparent stone alpha vs white metal sweep). Additive, signature-compatible.
- **Commit:** fcb211f

### Notes (no code change)

- The FINAL job is a classic job (intelState null) whose Layer lands in the existing
  gallery next to the SEED preview's Layer for the same combo — per-combo layer
  duplication in the gallery is a known consequence for 09-03 (the monitor/gallery UI)
  to present; the loop trace links it via `intel.finalJobId`.
- `Batch.jobCount` keeps the original matrix count; loop re-previews/finals add rows
  beyond it. Progress derivations that count job rows directly are unaffected in
  correctness, only in denominator.
- The plan's `09-02-PLAN.md` named the scorer module `analyze-preview.ts` (the
  orchestrator prompt suggested `score.ts`); the plan's `files_modified` names were
  followed.

## Verification Results

- `npx vitest run intel-preview-image intel-analyze-preview intel-sweep intel-webhook-hook intel-db-only orch-webhook orch-reconcile` — **46/46 GREEN**
- Full `npx vitest run` — **377 passed** (338 baseline + 39 new), 0 failures
- `npx tsc --noEmit` — exit 0
- No local `next build` (per instruction)
- Source guards: private-only reads (T-09-05), no hand-built recipe keys in sweep.ts
  (G10), webhook free of ai/sharp/analyzer imports (T-09-09), cron route wires the sweep

## Known Stubs

None. The loop's DONE transition (FINAL completion -> DONE) and the operator
accept/reject/override surface are explicit 09-03 scope (the webhook here flips ONLY
PREVIEW_QUEUED->ANALYZING per the plan's must-have truth).

## Commits

| Commit | Type | Content |
|--------|------|---------|
| 14682c5 | test | RED: private preview fetch + vision scorer tests |
| fcb211f | feat | preview-image.ts + analyze-preview.ts (INTEL-02) |
| e1c14ec | test | RED: ANALYZING sweep state machine tests |
| f8a469f | feat | sweep.ts + env kill-switch (INTEL-04) |
| 1497de2 | test | RED: webhook flip + createBatch opt-in + cron + source guards |
| 86cac13 | feat | webhook/createBatch/reconcile-route wire-in + vercel.json (INTEL-04) |

## Self-Check: PASSED

All 9 claimed files exist on disk; all 6 task commits (14682c5, fcb211f, e1c14ec, f8a469f, 1497de2, 86cac13) verified in git log.

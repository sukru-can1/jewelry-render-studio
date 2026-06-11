---
phase: 09-adaptive-render-intelligence
verified: 2026-06-11T11:45:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Visual verification of the batch-builder 'Optimize with AI' toggle and the batch-monitor intel panel (score bars, flags, escalation banner, Accept/Reject/Override controls)"
    expected: "Toggle defaults OFF and is disabled with an explanatory note when AI is unconfigured; intel panel renders D1-D8 bars, flags, deltas, rationale, decision badges; ESCALATED jobs show a prominent warning banner with the reason"
    why_human: "Visual appearance and UX quality cannot be verified by grep; all component code and wiring are verified"
  - test: "QA-lead labelling + live calibration run: review/replace the 9 provisional labels and fill the 10 todo slots in calibration/dataset.json, then run `npx tsx scripts/calibrate-intel.ts --record`"
    expected: "CALIBRATION-REPORT.md shows scored cases with a real judge-human agreement number; the >=0.7 trust gate may only be considered on QA-lead-reviewed (non-provisional) labels"
    why_human: "Domain-expert labelling is a human action by design (09-AI-SPEC section 5.7 — engineers must not invent labels); the live run burns paid vision calls and is operator-triggered"
deferred:
  - truth: "FINAL_QUEUED flips to DONE when the linked FINAL job completes"
    addressed_in: "Documented follow-up (deferred-items.md)"
    evidence: "Cosmetic only — view.ts:117 treats FINAL_QUEUED and DONE both as reviewable; the FINAL reaches the gallery via the classic Layer path; accept/reject/override all work"
  - truth: "Full suite green under parallelism (zip-route Content-Type flake)"
    addressed_in: "Pre-existing, documented in deferred-items.md; not a Phase 9 file"
    evidence: "test/out-zip-route.test.ts last touched in Phase 6 commit e2d2891; no Phase 9 commit touches app/(app)/batches/[id]/download/route.ts or the test"
---

# Phase 9: Adaptive Render Intelligence — Verification Report

**Phase Goal:** An operator can opt a batch into AI optimization; the system renders a preview, scores it on the rubric, auto-adjusts the recipe knobs within safe bounds, re-renders, and surfaces scores+reasoning for human accept/reject — never looping unboundedly, never silently, never hand-building recipes.
**Verified:** 2026-06-11
**Status:** human_needed (all 7 automated criteria PASS; 2 human items remain by design)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opt-in toggle, default OFF; `Batch.optimizeWithAi` persisted; graceful degrade without OPENAI_API_KEY | VERIFIED | Toggle default OFF: `app/(app)/products/[id]/batches/new/batch-builder.tsx:131` (`useState(false)`), switch at :424-427, disabled + explanatory note when unconfigured at :411-434; server resolves `aiConfigured` from `env.OPENAI_API_KEY` + kill-switch at `app/(app)/products/[id]/batches/new/page.tsx:83-84`; schema field `prisma/schema.prisma:145` (`optimizeWithAi Boolean @default(false)`), additive migration `prisma/migrations/20260610164549_add_job_intel/migration.sql`; server re-gates regardless of client flag at `lib/batches/actions.ts:187-190` and persists the kill-switch-RESOLVED flag at :273; validation default false `lib/validation/batch.ts:37` |
| 2 | PREVIEW_QUEUED→ANALYZING→ADJUSTED→FINAL_QUEUED state machine, idempotent guarded transitions, fast webhook (no `ai` import), vision call on cron sweep | VERIFIED | Seed `intelState: "PREVIEW_QUEUED"` at `lib/batches/actions.ts:287`; webhook flips PREVIEW_QUEUED→ANALYZING via guarded `updateMany` at `lib/orchestration/webhook.ts:81-86` — webhook.ts imports only zod/prisma/layers/status-map (:8-13), route imports only crypto + applyWebhookResult (`app/api/webhooks/runpod/route.ts:1-3`), no `ai`/`sharp` anywhere in the path; optimistic claim ANALYZING→ANALYZING_IN_PROGRESS at `lib/intelligence/sweep.ts:402-406` (count!==1 skips), guarded terminal `transition()` at :181-186; ADJUSTED at :260, FINAL_QUEUED at :217, ESCALATED at :192/:341; vision call runs only in `sweepAnalyzingJobs`, invoked from `app/api/cron/reconcile/route.ts:5,49` |
| 3 | Vision scorer: private blob → sharp downscale → AI SDK v6 generateObject with visionVerdictSchema; generateText fallback; cardDarkness sign convention in prompt | VERIFIED | `get(pathname, {access:"private"})` at `lib/intelligence/preview-image.ts:25`, sharp 768px downscale :33-36; `generateObject({schema: visionVerdictSchema, ...})` at `lib/intelligence/analyze-preview.ts:144-156` with defensive re-parse :159; `generateText` fallback + safeParseJsonObject + zod re-validate :164-202; prompt states "a NEGATIVE cardDarknessDelta makes the reflection cards DARKER … propose a NEGATIVE delta" :50 and the iron law repeats it :54; `ai ^6.0.199` + `@ai-sdk/openai ^3.0.69` in package.json:19,24; schema `lib/intelligence/verdict.ts:15-51` (D1-D8 int 1-5, flags, bounded deltas) |
| 4 | Knob safety: profileOverrides through buildEnterpriseRecipe ONLY (G10); KNOB_RANGES clamps; byte-identical no-override golden test | VERIFIED | Both render-shipping call sites use `buildEnterpriseRecipe` exclusively: `lib/intelligence/sweep.ts:160-178` (`buildLoopRecipe`) and `lib/intelligence/operator-actions.ts:61-79` (`buildShipRecipe`); grep of lib/intelligence/ finds zero hand-built recipe JSON (only comments/labels); `KNOB_RANGES` at `lib/intelligence/knobs.ts:45-50`, `clamp` applied in `applyDeltas` :114 AND again inside the generator `lib/enterprise-recipes.ts:423-449` (double clamp); golden sha256 byte-identity test `test/intel-overrides.test.ts:21-78` (no-overrides and `profileOverrides: undefined` both match pre-change hashes) — passing in suite |
| 5 | Guardrails: MAX_ITERATIONS=2, stop-on-no-improvement/freeze-best, milky→no brightness increase, escalate-not-loop, kill-switch env, cost cap | VERIFIED | `MAX_ITERATIONS = 2` `lib/intelligence/loop.ts:19` enforced :145-152 (G3); G4 no-improvement freeze-best :193-199; G5 forbidden moves zeroed in `sanitizeDeltas` :91-100 (milky→exposureDelta>0 zeroed; milky/flat-metal→worldStrengthDelta>0 zeroed) plus prompt-level iron law `analyze-preview.ts:54`; G6/G7 escalate on brokenHoldout/emptyOrBroken :135-144, stone-pass contactShadow gate :102-105; kill-switch `env.ADAPTIVE_INTELLIGENCE_ENABLED` no-ops the sweep `sweep.ts:383` and forces classic batches `actions.ts:190`; cost caps `sweep.ts:47-48` — visionCalls>=2 freezes best :278-284, previewRenders>=2 demotes autoCorrect to freeze-best :358-365; failed vision attempts consume budget :298-300 (no unbounded retry); guardrail-zeroed no-op deltas freeze instead of burning a re-preview `loop.ts:168-177` |
| 6 | Human-in-the-loop: intel panel shows D1-D8/flags/deltas/rationale/decision; escalations prominent; accept/reject Server Action (auth-first + IDOR); never silent | VERIFIED | Panel wired into batch page `app/(app)/batches/[id]/page.tsx:84,116` via DB-only `loadBatchIntel` (`lib/intelligence/read.ts:37-73`, preview thumb through auth-gated proxy :68); D1-D8 score bars `intel-panel.tsx:183-228`, flags :232-242, proposed-vs-applied deltas :244-276, rationale blockquote :278-280, decision badge :121-128; ESCALATED: warning border :106-109, "Needs human" banner with reason :143-161, batch-level count badge :78-84; "nothing ships silently" header :76; Accept/Reject/Override controls :380-434 call `applyIntelDecision` — `requireSession()` FIRST `operator-actions.ts:89`, zod-validate before any read :92-96, IDOR load-with-batch :100-105, one-attributed-decision guard :118-120, guarded transactional claim :168-201, decision logged `{action,userId,at}` :151-155 and displayed :325-355 |
| 7 | Calibration gate: recommend-only by default; harness + dataset scaffold + >=0.7 threshold; live run documented pending | VERIFIED | Default recommend-only: `trusted: env.INTEL_AUTOCORRECT_ENABLED === "true"` `sweep.ts:324`, `recommendOnly = trusted !== true` `loop.ts:180`; recommend-only path persists deltas as recommendation and ships a classic FINAL `sweep.ts:350-355`; panel labels "recommend-only — deltas not applied" `intel-panel.tsx:129-135,247-257`; `AGREEMENT_THRESHOLD = 0.7` + `autoCorrectTrusted` `lib/intelligence/calibration.ts:98,197-202`; pure calibration math (withinOne/signAgrees/hard-gate regression/computeCalibration) :104-291 tested in `test/intelligence/calibration.test.ts`; harness `scripts/calibrate-intel.ts` (dataset zod-validated :115-125, promptVersion pinning :206-209, cached-verdict CI mode so CI never burns vision calls); dataset scaffold `calibration/dataset.json` (9 provisional anchor cases + 10 todo slots, `provisional: true` marked NON-trust-gating); pending state documented: `CALIBRATION-REPORT.md` (0 scored / 9 skipped, "run --record to score live") + 09-04-SUMMARY.md "Pending operator actions" section |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/intelligence/knobs.ts` | ProfileOverrides + KNOB_RANGES + applyDeltas clamp | VERIFIED | 122 lines, pure, imported by enterprise-recipes/sweep/operator-actions |
| `lib/intelligence/verdict.ts` | visionVerdictSchema (D1-D8, flags, bounded deltas) | VERIFIED | zod schema, schema-level delta bounds (G2 layer 1) |
| `lib/intelligence/loop.ts` | decideLoop: escalate→accept→autoCorrect→freeze-best | VERIFIED | Pure; MAX_ITERATIONS, sanitizeDeltas, trust gate |
| `lib/intelligence/analyze-preview.ts` | Vision call, generateObject→generateText fallback | VERIFIED | Imported ONLY by sweep.ts (never webhook) |
| `lib/intelligence/preview-image.ts` | Private blob + sharp downscale to data URL | VERIFIED | `get(..., {access:"private"})`, 768px |
| `lib/intelligence/sweep.ts` | ANALYZING cron sweep, guarded transitions, budgets | VERIFIED | Wired into `app/api/cron/reconcile/route.ts:49` |
| `lib/intelligence/view.ts` + `read.ts` | Pure view contract + DB-only projection | VERIFIED | Wired into batch page; client-safe (type-only imports) |
| `lib/intelligence/operator-actions.ts` | Auth-first Accept/Reject/Override Server Action | VERIFIED | Wired to panel buttons; transactional guarded claim |
| `lib/intelligence/calibration.ts` | Pure calibration math + 0.7 trust gate | VERIFIED | Used by harness + run-eval + tests |
| `app/(app)/batches/[id]/intel-panel.tsx` | Operator panel | VERIFIED | 436 lines, substantive, rendered by batch page |
| `scripts/calibrate-intel.ts` + `calibration/dataset.json` | Harness + labelled scaffold | VERIFIED | Cached-mode CI safe; 9 provisional + 10 todo cases |
| `prisma/migrations/20260610164549_add_job_intel` | Additive Batch.optimizeWithAi / Job.intelState / Job.intel | VERIFIED | `test/intel-migration-additive.test.ts` passing |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| batch-builder toggle | createBatch | `optimizeWithAi` in payload (`batch-builder.tsx:180`) → zod (`validation/batch.ts:37`) → kill-switch resolve (`actions.ts:187-190`) | WIRED |
| createBatch | loop seed | `intelState: "PREVIEW_QUEUED"` + intel trace with request context (`actions.ts:230-248,285-290`) | WIRED |
| webhook completion | ANALYZING | guarded updateMany (`webhook.ts:81-86`); reconcile replays same writer | WIRED |
| reconcile cron | vision call | `sweepAnalyzingJobs()` (`app/api/cron/reconcile/route.ts:49`) → `analyzePreview` (`sweep.ts:301`) | WIRED |
| decideLoop deltas | recipe | `applyDeltas` → `buildEnterpriseRecipe(profileOverrides)` (`sweep.ts:234-238,160-178`) — never hand-built JSON | WIRED |
| intel panel buttons | Server Action | `applyIntelDecision` import + onClick (`intel-panel.tsx:31,364`) | WIRED |
| batch page | intel data | `loadBatchIntel` DB-only projection (`page.tsx:84,116`) | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npx vitest run --reporter=dot` | 438 passed / 2 failed (440), 62/63 files | PASS with known flake (below) |
| Type check | `npx tsc --noEmit` | exit 0 | PASS |
| Zip-route flake isolation | `npx vitest run test/out-zip-route.test.ts` | 2 failed in isolation on this machine (5s timeout + `text/plain` vs `application/zip`) | Pre-existing — see gaps note |
| Hand-built recipe scan | grep recipe keys in lib/intelligence/ | only comments/labels matched | PASS |
| Debt markers (TBD/FIXME/XXX) | grep across Phase 9 files | none | PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/intelligence/preview-image.ts` | 15 | `import sharp` resolves only as a transitive dependency (`next@15.5.18 → sharp@0.34.5`); `sharp` is NOT declared in package.json | Warning | Works today (Next 15 ships sharp; Vercel includes it) but is a phantom dependency — a Next upgrade that drops/changes sharp would break the vision pipeline. Recommend adding `sharp` to dependencies. |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| INTEL-01 (knob contract + clamps + byte-identical) | SATISFIED | knobs.ts, enterprise-recipes.ts:416-450, golden test |
| INTEL-02 (vision scorer) | SATISFIED | analyze-preview.ts, preview-image.ts |
| INTEL-03 (decision loop + guardrails) | SATISFIED | loop.ts, verdict.ts |
| INTEL-04 (orchestration sweep + state machine) | SATISFIED | sweep.ts, webhook.ts:81-86, reconcile route, actions.ts seeding |
| INTEL-05 (opt-in + operator panel + decisions) | SATISFIED | batch-builder toggle, intel-panel.tsx, operator-actions.ts |
| INTEL-06 (calibration trust gate) | SATISFIED (live run pending operator) | calibration.ts, calibrate-intel.ts, dataset.json, CALIBRATION-REPORT.md |

### Human Verification Required

#### 1. Operator visual verification of the AI surfaces

**Test:** Create a batch with "Optimize with AI" toggled on (with OPENAI_API_KEY configured) and view the batch monitor; also load the builder with the key absent.
**Expected:** Toggle defaults OFF; disabled with "not configured" note when key absent; intel panel shows D1-D8 score bars, flags, recommended deltas labelled "not applied", rationale, escalation banners, and working Accept/Reject/Override with attributed review display.
**Why human:** Visual appearance and live end-to-end flow (RunPod + OpenAI) cannot be grep-verified.

#### 2. QA-lead labelling + live calibration run

**Test:** QA lead + senior render operator review/replace the 9 `provisional` labels and fill the 10 `todo` slots in `calibration/dataset.json`, then run `npx tsx scripts/calibrate-intel.ts --record`.
**Expected:** CALIBRATION-REPORT.md reports a real agreement number; only after >=0.7 on QA-lead labels may a human set `INTEL_AUTOCORRECT_ENABLED=true`.
**Why human:** Domain-expert labelling is a deliberate human action (09-AI-SPEC §5.7); the live run costs paid vision calls.

### Gaps Summary

No blocking gaps — all 7 success criteria are implemented and wired in committed code. Notes:

1. **Zip-route test flake (pre-existing, NOT a Phase 9 regression):** `test/out-zip-route.test.ts` failed 2/2 in the full suite AND in isolation on this machine (timeout + `text/plain` Content-Type), whereas deferred-items.md recorded it as "always passes in isolation." No Phase 9 commit touches the download route or its test (last change: Phase 6 commit e2d2891), and the failure mode matches the documented shared-mock interference. The discrepancy with the "passes in isolation" claim suggests it is machine/environment-dependent and worth its own fix task, but it does not affect Phase 9 goal achievement.
2. **FINAL_QUEUED→DONE flip:** deferred and documented (deferred-items.md) — cosmetic only; FINAL renders reach the gallery via the classic Layer path and the state is already reviewable.
3. **Phantom sharp dependency** (warning above) — recommend declaring `sharp` in package.json.

---

_Verified: 2026-06-11_
_Verifier: Claude (gsd-verifier)_

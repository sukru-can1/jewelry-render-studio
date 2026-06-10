---
phase: 9
slug: adaptive-render-intelligence
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-10
---

# Phase 9 — Validation Strategy

> Derived from `09-AI-SPEC.md` §5 (eval strategy) + §6 (guardrails). Reuses the Phase 1–8
> Vitest 4.1.8 harness — NO Wave-0 install (ai@^6, @ai-sdk/openai@^3, zod, sharp, tsx all
> already present; package.json verified). Mock `prisma`, `@vercel/blob`, the `ai` module,
> and `sharp` (mirrors `test/ai-classify.test.ts` + `test/comp-flatten-route.test.ts`). The
> pure libs (knobs/verdict/loop/calibration) need no mocks. Live vision-scored loop + the
> ≥0.7 calibration agreement on REAL labels are manual / domain-expert checks.
>
> **Build verification:** `npx tsc --noEmit` + `npx vitest run` ONLY. Do NOT rely on local
> `next build` — local `.env.local` is clobbered (phase brief).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run** | `npx vitest run --reporter=dot` |
| **Calibration runner** | `npx tsx test/intelligence/run-eval.ts` |
| **Type gate** | `npx tsc --noEmit` (replaces `next build`) |
| **Estimated runtime** | ~60–75s (mostly mocked; no live vision calls in CI) |

---

## Sampling Rate

- After every task commit: `npx vitest run <the-touched-test-file> --reporter=dot`
- After every wave: `npx vitest run` + `npx tsc --noEmit`
- Before verify: full suite green + `npx tsc --noEmit` exit 0 + `npx prisma validate` exit 0
  + one live end-to-end optimize-with-AI batch verified (manual) + the calibration harness
  green (recommend-only until ≥0.7 with real labels).

---

## Per-Requirement Verification Map (Nyquist: every behavior has an `<automated>` signal)

| Requirement | Behavior | Test Type | Automated Command | Status |
|-------------|----------|-----------|-------------------|--------|
| INTEL-01 | `buildEnterpriseRecipe` with NO profileOverrides is byte-identical to today (backward-compatible; world.strength 0.105, exposure -0.58, contact alpha 0.115, cards unchanged) | unit (pure) | `npx vitest run intel-overrides` | ⬜ pending |
| INTEL-01 | profileOverrides apply worldStrength/exposure/cardDarkness/contactShadowStrength/cameraPreset, each CLAMPED to KNOB_RANGES (G2 layer 2) | unit (pure) | `npx vitest run intel-overrides` | ⬜ pending |
| INTEL-01 | `clamp()` saturates at both bounds; `applyDeltas` adds signed delta to current+default then clamps; cameraPreset passthrough | unit (pure) | `npx vitest run intel-knobs` | ⬜ pending |
| INTEL-03 | `visionVerdictSchema` validates 8 dims + 5 flags + 4 bounded deltas + cameraPresetSuggestion + overallScore + rationale; out-of-range delta + non-integer score rejected (G1/G2 layer 1) | unit (pure) | `npx vitest run intel-verdict` | ⬜ pending |
| INTEL-03 | `decideLoop` priority escalate→accept→autoCorrect→freeze-best; hard flags + emptyOrBroken → escalate; iter>=2 → escalate; non-improving rescore → freeze-best (G3/G4) | unit (pure) | `npx vitest run intel-loop-decision` | ⬜ pending |
| INTEL-03 | forbidden-move guard (G5) zeroes +exposureDelta on milky + +worldStrengthDelta on flat metal; pass-type gate (G7) drops contactShadowDelta on a stone pass | unit (pure) | `npx vitest run intel-loop-guardrails` | ⬜ pending |
| INTEL-03 | the Job.intelState/intel migration is ADDITIVE (adds nullable columns only; no drop/rename/SET NOT NULL); createBatchSchema accepts optional optimizeWithAi default false | source + unit | `npx vitest run intel-migration-additive` | ⬜ pending |
| INTEL-02 | `previewDataUrl` reads the PRIVATE blob (`get(pathname,{access:'private'})`), downscales via sharp, returns a base64 data URL; null get() throws; never /api/file | unit (mock blob+sharp) | `npx vitest run intel-preview-image` | ⬜ pending |
| INTEL-02 | `analyzePreview` runs generateObject→generateText fallback validated against visionVerdictSchema with imageDetail:"low"; missing OPENAI_API_KEY throws "not configured" | unit (mock ai+blob+sharp) | `npx vitest run intel-analyze-preview` | ⬜ pending |
| INTEL-04 | the ANALYZING sweep claims idempotently (count===1), analyzes, applies decideLoop, re-dispatches preview (autoCorrect) / queues final (accept/freeze-best) / escalates — via buildEnterpriseRecipe(profileOverrides) only (G10) | unit (mock prisma+analyze+recipes+env) | `npx vitest run intel-sweep` | ⬜ pending |
| INTEL-04 | kill-switch (G9): no OPENAI_API_KEY / ADAPTIVE_INTELLIGENCE_ENABLED=false → sweep no-op; cost cap (G8): visionCalls>=2 → freeze-best→FINAL | unit | `npx vitest run intel-sweep` | ⬜ pending |
| INTEL-04 | the completion webhook FLIPS a PREVIEW_QUEUED job to ANALYZING via guarded updateMany (fast, no vision call inline); a null-intel job is untouched; a duplicate completion no-ops | unit (mock prisma) | `npx vitest run intel-webhook-hook` | ⬜ pending |
| INTEL-04 | intelligence libs read private blobs only + the loop emits recipes ONLY via buildEnterpriseRecipe (no hand-built recipe keys) — G10 source guard | source guard | `npx vitest run intel-db-only` | ⬜ pending |
| INTEL-04 | existing webhook + reconcile behavior unchanged (regression) | unit | `npx vitest run orch-webhook orch-reconcile` | ⬜ pending |
| INTEL-05 | `loadBatchIntel` is DB-only and projects scores/flags/deltas/rationale/decision/operatorAction per job; excludes null-intel jobs; tolerates partial intel | unit (mock prisma) | `npx vitest run intel-read` | ⬜ pending |
| INTEL-05 | `applyIntelDecision` is auth-first (401 no write) + IDOR-scoped (unknown job no write) + logs operatorAction {action,userId,at}; invalid action rejected | unit (mock prisma+requireSession) | `npx vitest run intel-operator-actions` | ⬜ pending |
| INTEL-05 | batch detail page stays RunPod-free with the intel panel added (DB-only source guard) | source guard | `npx vitest run orch-db-only` | ⬜ pending |
| INTEL-06 | `withinOne` ±1 boundary; `signAgrees` catches the milky anti-pattern (+exposure vs expected -); `agreementScore` fraction; `autoCorrectTrusted(0.7)` true / (0.69) false | unit (pure) | `npx vitest run calibration` | ⬜ pending |
| INTEL-06 | `decideLoop` gates auto re-dispatch behind `trusted` — recommend-only by default; trusted:true → recommendOnly:false | unit (pure) | `npx vitest run intel-loop-decision` | ⬜ pending |
| INTEL-06 | the calibration runner asserts ±1 + sign-agreement + all three hard gates fire on the labelled bad set + computes judge↔human agreement (cached verdicts, no CI vision calls) | integration (cached) | `npx tsx test/intelligence/run-eval.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live optimize-with-AI batch end-to-end | INTEL-02/04/05 | Live GPU + vision + multi-render async loop | Create a 1–2 job batch with the toggle ON; confirm preview renders → webhook flips ANALYZING → cron sweep scores → either a final queues (accept/freeze-best) or a corrected preview re-renders (autoCorrect) → intel panel shows scores/deltas/rationale/decision |
| A1 — `gpt-5.5-pro` vision + structured output in one call | INTEL-02 | Provider behavior (research assumption) | One throwaway analyzePreview against a real preview; if generateObject rejects vision+structured-output, confirm the generateText fallback still validates against visionVerdictSchema (graceful degrade) |
| Operator Accept / Reject / Override + never-silent | INTEL-05 | Visual / interactive | On the monitor, Accept ships the frozen-best; Override picks a different iteration's overrides; both log operatorAction; nothing ships without the operator seeing scores+reasoning |
| Escalation surfaces its reason | INTEL-05 | Visual | Force a brokenHoldout (stone-pass token mismatch) or an empty/black render; confirm a distinct "Needs human" banner with the escalateReason — never an auto-loop |
| Forbidden-move guard holds on a real milky verdict | INTEL-03 | Live model behavior | On a genuinely milky preview, confirm the applied delta darkens cards / lowers world strength and NEVER raises exposure (G5 in production, not just unit) |
| Judge↔human agreement ≥0.7 on REAL labels | INTEL-06 | Domain-expert labels | QA lead + senior operator fill labels.json; run-eval prints agreement; auto-correct stays recommend-only until ≥0.7 with non-provisional labels |
| No-purple / teal-only / Geist-mono numerics on the intel UI | INTEL-05 | Visual / design | Confirm the toggle + intel panel honor the CLAUDE.md UI constraints (no purple, teal accent, mono numerics, prefers-reduced-motion) |
| sharp downscale + private blob read on Vercel | INTEL-02 | Deploy env | Confirm previewDataUrl loads the linux sharp binary + reads a private render under the cron sweep's time budget |

---

## Guardrail Coverage (09-AI-SPEC §6 — every online guardrail has a test)

| Guardrail | Where enforced | Automated proof |
|-----------|----------------|-----------------|
| G1 schema validation | verdict.ts `.parse()` (both ai paths) | `intel-verdict`, `intel-analyze-preview` |
| G2 delta range-bounding (2 layers) | schema `.min()/.max()` + `clamp()` in applyDeltas | `intel-verdict` + `intel-knobs`/`intel-overrides` |
| G3 MAX_ITERATIONS=2 | decideLoop | `intel-loop-decision` |
| G4 stop-on-no-improvement | decideLoop (freeze-best on Δ≤0) | `intel-loop-decision` |
| G5 forbidden-move | decideLoop guardrail | `intel-loop-guardrails` |
| G6 escalate-not-loop | decideLoop escalate branch + sweep no-redispatch | `intel-loop-decision` + `intel-sweep` |
| G7 pass-type knob gate | decideLoop (stone pass) | `intel-loop-guardrails` |
| G8 cost cap | sweep (visionCalls/previewRenders) | `intel-sweep` |
| G9 kill switch | sweep + createBatch + webhook (key/env/per-batch) | `intel-sweep`, `intel-webhook-hook` |
| G10 single quality source | sweep emits only ProfileOverrides via buildEnterpriseRecipe | `intel-db-only` |
| Calibration gate (≥0.7) | autoCorrectTrusted → decideLoop recommend-only | `calibration` + `run-eval.ts` |

---

## Validation Sign-Off

- [x] Every requirement has an automated verify or a justified manual check (Nyquist)
- [x] INTEL-01 backward-compat (no-override identity) + clamp covered by pure unit tests
- [x] INTEL-03 schema + decision priority + every guardrail (G1–G10) covered
- [x] INTEL-02 private-blob read + downscale + generateObject/text fallback covered
- [x] INTEL-04 idempotent state machine + webhook flip + kill-switch + cost cap covered
- [x] INTEL-05 auth-first + IDOR operator action + DB-only intel read + never-silent UI covered
- [x] INTEL-06 ±1 + sign-agreement + hard gates + ≥0.7 trust gate (recommend-only default) covered
- [x] Build verified via tsc + vitest (NOT local next build)
- [x] `nyquist_compliant: true`

**Approval:** pending

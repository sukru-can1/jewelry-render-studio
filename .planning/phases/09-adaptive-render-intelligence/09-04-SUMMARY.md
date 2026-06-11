---
phase: 09-adaptive-render-intelligence
plan: 04
subsystem: render-intelligence-calibration
tags: [intelligence, calibration, trust-gate, recommend-only, eval-harness, INTEL-06]
requires:
  - "09-01: decideLoop decision priority + sanitizeDeltas (G5/G7), visionVerdictSchema, KNOB contract"
  - "09-02: sweepAnalyzingJobs state machine, JobIntel trace, queueFinal/queueAdjustedPreview, analyzePreview"
  - "09-03: IntelPanel + JobIntelView projection (where the recommendation surfaces to the operator)"
provides:
  - "lib/intelligence/calibration.ts (PURE): withinOne / signOf+signAgrees(epsilon) / evaluateCase / agreementScore / autoCorrectTrusted(>=0.7) / computeCalibration / renderCalibrationMarkdown"
  - "decideLoop trusted?: boolean gate — autoCorrect returns recommendOnly:true (deltas = RECOMMENDATION) unless trusted===true; accept/escalate/freeze-best unaffected"
  - "INTEL_AUTOCORRECT_ENABLED env flag (default absent = recommend-only): the sweep ships a classic FINAL and persists recommendOnly + recommendedDeltas on the trace instead of auto re-previewing"
  - "calibration/dataset.json: 9 provisional labelled anchors (4 known-good ring99 local, 4 known-bad zanessa private-blob renders/cmq7ya73*, 1 committed black adversarial) + 10 TODO coverage slots (19 entries, 12-20 target)"
  - "scripts/calibrate-intel.ts: the calibration harness — cached-verdicts-only by default (zero AI calls), --record scores live, writes CALIBRATION-REPORT.md/.json, exits nonzero on a hard-gate safety regression"
  - "test/intelligence/run-eval.ts: the 09-AI-SPEC §5.8 CI entrypoint (cached-only delegation)"
  - "analyzeImageDataUrl(dataUrl, ctx): additive split of analyzePreview so local fixture files can be graded"
  - "IntelPanel 'recommend-only — deltas not applied' badge + 'Recommended … (not applied)' deltas row"
affects:
  - "production rollout: the 'Optimize with AI' loop stays recommend-only until calibration >=0.7 on QA-lead labels AND a human sets INTEL_AUTOCORRECT_ENABLED=true"
  - "any future vision-prompt/schema change: bump promptVersion in dataset.json + CALIBRATION_PROMPT_VERSION, re-record verdicts"
tech-stack:
  added: []
  patterns:
    - "calibration math is a PURE lib module; the harness script is I/O wiring only with DYNAMIC imports of ai/blob/sharp so cached-only mode needs no configured env"
    - "live AI scoring requires an explicit --record opt-in — a present OPENAI_API_KEY alone never triggers token spend"
    - "trust gating is a single readable boolean fed from env at ONE call site (sweep -> decideLoop trusted) — the pure decision module stays env-free"
key-files:
  created:
    - "lib/intelligence/calibration.ts"
    - "calibration/dataset.json"
    - "calibration/README.md"
    - "calibration/fixtures/adversarial-black.png"
    - "scripts/calibrate-intel.ts"
    - "test/intelligence/run-eval.ts"
    - "test/intelligence/calibration.test.ts"
    - ".planning/phases/09-adaptive-render-intelligence/CALIBRATION-REPORT.md (placeholder — 0 scored, pending operator --record run)"
  modified:
    - "lib/intelligence/loop.ts (trusted?: boolean input, recommendOnly on autoCorrect results)"
    - "lib/intelligence/sweep.ts (trusted wiring, recommendOnly branch -> classic FINAL, JobIntel.recommendOnly/recommendedDeltas)"
    - "lib/intelligence/view.ts (normalizeIntel passthrough + JobIntelView.recommendOnly)"
    - "lib/intelligence/read.ts (recommendOnly projection)"
    - "lib/intelligence/analyze-preview.ts (additive analyzeImageDataUrl split)"
    - "lib/env.ts (INTEL_AUTOCORRECT_ENABLED optional)"
    - "app/(app)/batches/[id]/intel-panel.tsx (recommend-only badge + not-applied wording)"
    - "test/intel-sweep.test.ts (trusted-mode env flag + recommend-only default suite)"
key-decisions:
  - "Trust = env flag, not stored state: INTEL_AUTOCORRECT_ENABLED must be EXACTLY 'true'; flipping it is the deliberate human act after calibration passes >=0.7 on non-provisional labels"
  - "recommend-only keeps decision='autoCorrect' on the trace with recommendOnly:true + recommendedDeltas — the FINAL ships the frozen-best (identity {} on the seed), deltas recorded as 'recommended, not applied'"
  - "live scoring gated behind --record so running the harness (or CI) with a key present can never silently burn vision tokens"
  - "escalate-labelled bad cases expect ALL delta signs 0 — encodes the iron law 'broken holdout -> propose NO deltas' as a graded check"
  - "agreement over an empty scored set is 0 (never trusted on no evidence); provisional labels mark any agreement NON-trust-gating in the report"
patterns-established:
  - "verdict cache keyed by case id under promptVersion: calibration/verdicts.cache.json; stale version = ignored + re-recorded (T-09-16)"
  - "hard-gate miss on the bad set = nonzero exit from the harness regardless of overall agreement (T-09-15 safety regression)"
requirements-completed: [INTEL-06]
duration: ~85min
completed: 2026-06-11
---

# Phase 9 Plan 04: Reference-Dataset Calibration Gate Summary

**The judge↔human calibration gate (INTEL-06): pure ±1/sign-agreement/hard-gate math + a cached-verdict harness over a 19-entry provisional reference set, with auto-correct hard-locked to recommend-only behind `INTEL_AUTOCORRECT_ENABLED` until agreement ≥0.7 on QA-lead-reviewed labels.**

## Performance

- **Duration:** ~85 min
- **Started:** 2026-06-11T06:19:13Z
- **Completed:** 2026-06-11T07:45:00Z (approx.)
- **Tasks:** 2 of 3 executed (Task 1 is the QA-lead labelling human-action — built as scaffold, labelling pending operator)
- **Files modified:** 17

## Accomplishments

1. **Pure calibration math** (`lib/intelligence/calibration.ts`, zero impure imports):
   `withinOne` (±1 per-dimension tolerance), `signOf`/`signAgrees` (epsilon-aware
   delta-direction check — the "raise brightness to fix milky" anti-pattern catcher),
   `evaluateCase`, `agreementScore` (passing-check fraction), `autoCorrectTrusted`
   (≥0.7), `computeCalibration` (per-dimension rates + hard-gate hit rate with per-case
   failures + sign-agreement rate + overall agreement) and `renderCalibrationMarkdown`.

2. **Recommend-only enforcement** (the T-09-14 mitigation):
   - `decideLoop` gains `trusted?: boolean` (default false). An autoCorrect decision
     now carries `recommendOnly: trusted !== true`; sanitized deltas are still returned
     as the recommendation. Accept/escalate/freeze-best are untouched.
   - `sweepAnalyzingJobs` feeds `trusted: env.INTEL_AUTOCORRECT_ENABLED === "true"`.
     When `recommendOnly`, the sweep persists the verdict + `recommendedDeltas` +
     `recommendOnly: true` on the `Job.intel` trace, sets the reason to
     `…Deltas recommended, not applied…`, and goes **straight to a classic FINAL**
     (frozen-best overrides — identity `{}` on the seed) instead of re-dispatching a
     corrected preview. Flipping the env to `"true"` restores the 09-02 auto-apply path
     byte-for-byte.
   - The intel panel shows a `recommend-only — deltas not applied` badge and renames
     the deltas row to `Recommended … (not applied)` so nothing is silent (T-09-12).

3. **Dataset scaffold** (`calibration/dataset.json`, 19 entries — inside the 12–20 target):
   - 4 known-good ring99 anchors (local paths: `goal_77diamonds_1477_classic_round.png`
     front + 3 `postprod_v149d_goal77_goalcut` hero variants) labelled accept/high.
   - 4 known-bad zanessa anchors (PRIVATE blob pathnames under `renders/cmq7ya73*`,
     resolved read-only from the live DB with their real combo coordinates: metal/stone ×
     hero/front, yellow) labelled framing/holdout 1, `brokenHoldout` expected (+
     `emptyOrBroken` on the worst stone pass), escalate, all delta signs 0 (iron law).
   - 1 committed adversarial black frame (`calibration/fixtures/adversarial-black.png`,
     768², 1.8 KB) expecting `emptyOrBroken`.
   - 10 clearly-marked `todo:*` slots covering the remaining required coverage
     (yellow/rose good, top/profile angles, milky, white-gold-chrome, blown, flat metal,
     floating product, holdout fringing).
   - All filled labels flagged `provisional: true` — engineer anchors pending QA-lead +
     senior-operator review; the harness reports provisional agreement as NON-trust-gating.

4. **Calibration harness** (`scripts/calibrate-intel.ts` + `test/intelligence/run-eval.ts`):
   - zod-validates the dataset; supports BOTH local file paths (sharp downscale →
     `analyzeImageDataUrl`) and private blob pathnames (`analyzePreview` — the exact
     production scoring path).
   - **Cached-verdicts-only by default** (`calibration/verdicts.cache.json`, keyed by
     case id under `promptVersion`): CI burns ZERO vision calls; uncached cases are
     skipped with an explicit note. `--record` is the only way tokens are spent.
   - Computes the full report and writes
     `.planning/phases/09-adaptive-render-intelligence/CALIBRATION-REPORT.md` + `.json`;
     prints per-dimension within-±1 rates, hard-gate hit rate, sign-agreement rate,
     agreement and the trusted verdict; **exits nonzero when an expected hard gate did
     not fire** on a scored bad-set case (safety regression), even though agreement is
     still reported.

## Calibration metrics (current state)

The live scorer was deliberately NOT run in this execution (cost; operator-triggered).
Cached-only smoke run output:

| Metric | Value |
|--------|-------|
| Scored cases | 0 (no cached verdicts yet) |
| Skipped | 9 (all labelled anchors — awaiting `--record`) |
| TODO slots | 10 |
| Per-dimension within-±1 | n/a |
| Hard-gate hit rate | n/a |
| Delta sign-agreement | n/a |
| Judge↔human agreement | n/a |
| autoCorrectTrusted (≥0.7) | **NO** → loop stays **RECOMMEND-ONLY** |

The pure-path vitest suite proves the pipeline end-to-end with synthetic verdicts:
a perfectly-agreeing judge over the shipped dataset scores agreement **1.0** with
all expected hard gates firing; silencing the flags is caught as a per-case safety
regression (`bad-zanessa-*` × brokenHoldout, `bad-zanessa-stone-front-yellow` ×
emptyOrBroken, `adversarial-empty-black` × emptyOrBroken).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | QA-lead labelling (checkpoint:human-action) | — (pending operator) | dataset scaffold built in Task 3 commit |
| 2 (RED) | failing calibration + trust-gate tests | `736362a` | test/intelligence/calibration.test.ts, test/intel-sweep.test.ts |
| 2 (GREEN) | pure calibration math + recommend-only gate | `bc38961` | lib/intelligence/{calibration,loop,sweep,view}.ts, lib/env.ts |
| 2 (UI) | surface recommend-only on the intel panel | `4c02a6b` | lib/intelligence/{view,read}.ts, intel-panel.tsx |
| 3a | dataset scaffold + provisional anchors | `92962ec` | calibration/{dataset.json,README.md,fixtures/adversarial-black.png} |
| 3b | calibrate-intel harness + run-eval wrapper | `a282061` | scripts/calibrate-intel.ts, test/intelligence/run-eval.ts, analyze-preview.ts, calibration.test.ts |

## TDD Gate Compliance

- RED gate: `736362a` (`test(09-04)…`) — confirmed failing (2 files, import error + 2 assertion failures) before implementation.
- GREEN gate: `bc38961` (`feat(09-04)…`) — 53/53 targeted tests green.
- REFACTOR: not needed (no cleanup pass required).

## Deviations from Plan

### Directive-driven (orchestrator scope overrides the plan file)

**1. Artifact paths:** the labelled dataset lives at `calibration/dataset.json`
(NOT the plan's `test/intelligence/fixtures/labels.json`) and the harness at
`scripts/calibrate-intel.ts`, per the execution directive. The plan's
`test/intelligence/run-eval.ts` artifact IS shipped — as the CI wrapper delegating
to the same harness (satisfies the 09-AI-SPEC §5.8 command verbatim). One source
of truth; no duplicated label file.

**2. Task 1 checkpoint not paused:** built the full scaffold + provisional anchor
labels and marked QA-lead labelling as *pending operator action* per the directive
(equivalent to the plan's "use provisional labels" resume branch — the ≥0.7 gate
therefore stays recommend-only by construction).

**3. Trust flag spelled `INTEL_AUTOCORRECT_ENABLED`** (directive) wired through
`decideLoop`'s `trusted` param (plan) — both contracts honored.

### Auto-fixed / safety hardening

**4. [Rule 2 — cost safety, T-09-16] `--record` opt-in for live scoring.** The plan
said "call analyzePreview when a cache entry is missing AND OPENAI_API_KEY is
present". A key IS present in local `.env.local`, so that behavior would have burned
vision tokens on any harness run (including this execution's smoke test). Live
scoring now requires the explicit `--record` flag; default is cached-only.

**5. [Rule 3 — unblocking dual sources] additive `analyzeImageDataUrl` split** in
`analyze-preview.ts` (file not in the plan's list): `analyzePreview` only accepts
private blob pathnames, but the directive requires local file paths as sources too.
`analyzePreview` behavior is unchanged (delegates after the blob fetch); all 7
existing analyze-preview tests still green.

## Known Stubs (intentional, tracked)

| Stub | File | Why intentional |
|------|------|-----------------|
| 10 `todo:*` coverage slots | calibration/dataset.json | QA lead + senior operator fill them (engineers must not invent labels — 09-AI-SPEC §5.7); harness skips them explicitly |
| `provisional: true` on all 9 filled anchors | calibration/dataset.json | Engineer-provisional pending domain-expert review; report marks agreement NON-trust-gating |
| `calibration/verdicts.cache.json` absent | — | Created by the operator's first `--record` run; cached-only mode handles absence with per-case skip notes |
| CALIBRATION-REPORT.md shows 0 scored | .planning/phases/09-…/CALIBRATION-REPORT.md | Placeholder until the operator runs `--record`; documents the pending state |

None of these block the plan's goal: the trust gate is **closed by default**, which
is exactly the safe state the gate exists to guarantee.

## Pending operator actions (Task 1 + live calibration)

1. **QA lead + senior render operator** review/replace every `provisional` label and
   fill the 10 `todo` slots in `calibration/dataset.json` (protocol in
   `calibration/README.md`), then set `provisional: false`.
2. **Run the live calibration** (burns OpenAI vision tokens; needs `.env.local`):
   ```bash
   npx tsx scripts/calibrate-intel.ts --record
   ```
   Re-runs are cache-hits (free). Report lands at
   `.planning/phases/09-adaptive-render-intelligence/CALIBRATION-REPORT.md`.
3. **If agreement ≥ 0.7 on the reviewed labels:** set `INTEL_AUTOCORRECT_ENABLED=true`
   in the Vercel env to open the auto-correct gate. Until then (and by default) the
   loop scores, decides, recommends — and ships classic finals.

## Verification

- `npx vitest run calibration intel-loop-decision intel-loop-guardrails` — GREEN (53 tests)
- Full suite: **440/440 passed** (403 baseline + 37 new); one intermittent
  pre-existing zip-route flake observed at baseline is logged in deferred-items.md
- `npx tsc --noEmit` — exit 0
- `npx tsx scripts/calibrate-intel.ts` — runs cached-only, zero AI calls, exit 0
- `npx tsx test/intelligence/run-eval.ts` — runs, prints recommend-only verdict, exit 0
- No `next build` run (per phase brief)

## Self-Check: PASSED

All 10 claimed files exist on disk; all 5 task commits present in git log;
must-have link patterns verified (`autoCorrectTrusted` in calibration.ts + loop.ts,
`agreement`/`analyzePreview` in run-eval.ts, `diamondBrilliance` in the dataset).

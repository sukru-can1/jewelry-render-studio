# 09-AI-SPEC — Adaptive Render Intelligence: Evaluation, Guardrails & Monitoring

> **System type:** Autonomous (bounded, vision-in-the-loop) render-intelligence controller.
> **Framework:** Vercel AI SDK v6 (`ai@^6`) + `@ai-sdk/openai@^3`, model `gpt-5.5-pro` (vision + structured output).
> **Scope of this doc:** Sections 5–7 of the AI-SPEC — the **evaluation strategy, guardrails, and production monitoring** for the vision-scored adaptive render loop. It consumes the scoring rubric from `09-DOMAIN.md` and the orchestration/state-machine + knob contract from `09-AI-RESEARCH.md`. It does **not** redesign the loop.
> **Opt-in:** This whole system is gated behind an **"Optimize with AI"** toggle on the batch builder. Default **OFF**. Honors the existing optional-env gating: if `OPENAI_API_KEY` is absent or `ADAPTIVE_INTELLIGENCE_ENABLED` is false, the loop is bypassed and batches render exactly as today.

---

## How the rubric maps onto the structured output

`09-DOMAIN.md` defines **8 scoring dimensions (D1–D8)** with 1–5 anchors and three **hard gates** (D1 milkiness, D3 wrong-metal, D8 broken holdout). `09-AI-RESEARCH.md` sketched a 5-field placeholder schema; **this spec supersedes it** with the full 8-dimension schema below, while keeping the research's bounded-relative-delta contract, `KNOB_RANGES` clamps, `MAX_ITERATIONS=2`, and early-exit-at-`overallScore≥4` exactly as specified.

**Anchor convention difference (important):** The DOMAIN rubric uses **1 = reject, 5 = catalog-ready** for the eight quality dimensions (higher is better). The research placeholder used "3 = ideal, 1/5 = failure poles." We adopt the **DOMAIN convention (higher = better, 5 = best)** for D1–D8 because it matches the hard-gate language ("D1 = 1 is a reject") and the accept bar ("D1 ≥ 4"). Deltas remain signed relative nudges.

---

# Section 5 — Evaluation Strategy

## 5.1 Eval dimensions (from the domain rubric)

Eight quality dimensions plus two cross-cutting eval concerns (loop safety, cost). Each maps to a field in the structured output and a measurement approach.

| # | Dimension | Rubric (PASS / FAIL) | Measurement | Priority |
|---|-----------|----------------------|-------------|----------|
| **D1** | Diamond brilliance & fire | **PASS (≥4):** crisp facet micro-contrast, bright/dark mosaic, visible sparkle, reads as a real diamond. **FAIL (=1):** uniform pale gray wash, no facet structure, frosted-glass/plastic, no sparkle (**milky** — the #1 failure). | LLM judge (vision) + Human calibration | **Critical (hard gate)** |
| **D2** | Metal highlight integrity | **PASS (≥3):** highlights bright but hold gradient/shape; band curvature readable. **FAIL (=1):** large pure-white (255) blobs, band silhouette dissolves into background. | LLM judge (vision) | High |
| **D3** | Metal material believability | **PASS (≥4):** reads unmistakably as the intended alloy (yellow/white/rose gold), lustrous. **FAIL (=1):** plastic/chrome/wrong color; white gold gone pure-white. | LLM judge (vision) + Human calibration | **Critical (hard gate)** |
| **D4** | Exposure / tonal balance | **PASS (≥4):** full tonal range, rich contrast, true darks present. **FAIL (=1):** washed-out/milky across frame OR muddy-dark; no contrast. | LLM judge (vision) | High |
| **D5** | Center-stone bilateral symmetry | **PASS (≥3):** facet mosaic near-mirror-symmetric (critical on `top`/`front`). **FAIL (=1):** obviously lopsided/tilted stone. | LLM judge (vision) | Medium (Critical on top/front) |
| **D6** | Contact-shadow believability | **PASS (≥3):** subtle, well-placed grounding shadow (metal/full passes). **FAIL (=1):** floating (no shadow) or heavy/dirty/misplaced. N/A on stone passes — do not penalize. | LLM judge (vision) + Code (pass-type gate) | Medium |
| **D7** | Framing / crop / centering | **PASS (≥3):** centered, fully in frame, catalog-standard scale. **FAIL (=1):** clipped at edge, badly off-center, mis-scaled. | LLM judge (vision) | Medium |
| **D8** | Background cleanliness & holdout integrity | **PASS (≥3):** clean white sweep (metal/full) or clean transparent alpha (stone); no fringing. **FAIL (=1):** dark fringe/halo, wrong pass contents, metal in stone pass — **breaks layered compositing**. | LLM judge (vision) + Code (alpha/pass check) | **High (hard gate)** |
| **E1** | Loop convergence | **PASS:** loop reaches accept bar OR halts cleanly within `MAX_ITERATIONS=2`; each iteration's `overallScore` improves or freezes-best. **FAIL:** oscillation, regression shipped, non-termination. | Code | Critical |
| **E2** | Cost adherence | **PASS:** ≤2 vision calls + ≤2 preview renders + 1 final render per job. **FAIL:** budget exceeded. | Code | High |

### Per-metal weighting (eval emphasis, from DOMAIN §"Per-Metal Weighting")
- **White gold:** weight **D3, D4, D5** heaviest; pure-white = automatic D3=1. Bias corrections toward **↓ worldStrength**.
- **Yellow gold:** weight **D2 (clipping)** and **D3 hue**; warm saturation must survive.
- **Rose gold:** weight **D3 hue accuracy** highest; pink must stay distinct from yellow.

### Per-angle weighting (eval emphasis, from DOMAIN §"Per-Angle Weighting")
- **hero:** D1, D3, D4. Tolerate some stone asymmetry.
- **front:** D1 + camera-height (symptom 6) + D5. A dull front stone usually = camera too high → `cameraPreset`.
- **top:** D5 symmetry + D7 centering.
- **profile:** D2 + D3. D5 not applicable; do not penalize asymmetry.

> These weights inform the **human calibration scoring** and the operator's read of the rationale. The `overallScore` field is the model's own single gate number — code does **not** recompute a weighted sum (keeps the early-exit condition unambiguous, per research §3). The weights are a **calibratable assumption**: if judge↔human agreement is weak on a given metal/angle, fold an explicit weighting hint into the vision prompt.

## 5.2 Scoring schema (the structured output contract)

The exact object the vision model returns. Lives in `lib/intelligence/analyze-preview.ts`. `generateObject` validates against it; we re-`.parse()` defensively (mirrors `lib/inspection/ai-classify.ts`), and the `generateText` + safe-JSON-parse fallback re-validates the **same** schema so both paths yield identical trusted shapes.

```ts
// lib/intelligence/analyze-preview.ts
import { z } from "zod";

const score = z.number().int().min(1).max(5); // 1 = reject, 5 = catalog-ready

export const visionVerdictSchema = z.object({
  // --- D1–D8 quality scores (higher = better; 1/3/5 anchors per 09-DOMAIN) ---
  scores: z.object({
    diamondBrilliance:   score, // D1 facet micro-contrast / fire (hard gate)
    metalHighlight:      score, // D2 clipping / blown whites
    metalBelievability:  score, // D3 correct alloy, not plastic/chrome (hard gate)
    exposureTonal:       score, // D4 milky-vs-rich overall exposure
    stoneSymmetry:       score, // D5 bilateral symmetry (top/front critical)
    contactShadow:       score, // D6 grounding (N/A on stone pass)
    framing:             score, // D7 crop / centering
    backgroundHoldout:   score, // D8 clean bg / clean alpha (hard gate)
  }),

  // --- Hard-flag booleans (drive the hard-gate / escalate logic) ---
  flags: z.object({
    milky:          z.boolean(), // D1=1 trigger: uniform pale stone, no facets
    wrongMetal:     z.boolean(), // D3=1 trigger: chrome/plastic/pure-white/wrong hue
    brokenHoldout:  z.boolean(), // D8=1 trigger: fringing / wrong-pass contents (ESCALATE, not knob)
    blownHighlights:z.boolean(), // D2 severe: large clipped white regions
    emptyOrBroken:  z.boolean(), // structural failure: nothing rendered / black frame
  }),

  // --- Recommended knob deltas: RELATIVE, signed, schema-bounded (research §3, §6) ---
  // The model never sees current recipe values; it only proposes a nudge direction+size.
  adjust: z.object({
    worldStrengthDelta:   z.number().min(-0.05).max(0.05), // ↓ to fix milky/over-bright
    exposureDelta:        z.number().min(-1).max(1),       // ↓ (more negative) to protect highlights
    cardDarknessDelta:    z.number().min(-0.4).max(0.4),   // ↑ darkness = readable facets/contrast
    contactShadowDelta:   z.number().min(-0.1).max(0.1),   // ↑ to ground; ↓ if heavy/dirty
  }),
  // cameraPreset is a discrete recommendation, not a delta (symptom 6/9):
  cameraPresetSuggestion: z.enum(["hero", "front", "top", "profile"]).nullable(),

  overallScore: score,            // single early-exit gate number (model-assigned)
  rationale: z.string().max(600), // audit trail for the operator monitor; never parsed by code
});

export type VisionVerdict = z.infer<typeof visionVerdictSchema>;
```

### Mapping deltas → `profileOverrides` (consumes research §6 verbatim)

The model emits **relative deltas**; the server adds them to the *current* recipe knob values (known server-side, never shown to the model) and **clamps to `KNOB_RANGES`** before anything reaches `buildEnterpriseRecipe`:

```ts
// lib/intelligence/knobs.ts — from 09-AI-RESEARCH §6 (authoritative)
export const KNOB_RANGES = {
  worldStrength:         [0.04, 0.20] as const, // recipe default 0.105
  exposure:              [-1.5, 0.3] as const,  // recipe default -0.58
  cardDarkness:          [0.0, 0.5]  as const,  // scales reflection_cards[].color
  contactShadowStrength: [0.04, 0.22] as const, // recipe default 0.115
} as const;
// cameraPreset selects an existing ANGLES key (no numeric clamp).
```

| Schema field | profileOverride knob | Recipe field touched | Clamp |
|--------------|----------------------|----------------------|-------|
| `adjust.worldStrengthDelta` | `worldStrength` | `world.strength` | `[0.04, 0.20]` |
| `adjust.exposureDelta` | `exposure` | `render.exposure` | `[-1.5, 0.3]` |
| `adjust.cardDarknessDelta` | `cardDarkness` | `reflection_cards[].color` (scaled) | `[0.0, 0.5]` |
| `adjust.contactShadowDelta` | `contactShadowStrength` | `contact_shadows[].alpha` | `[0.04, 0.22]` |
| `cameraPresetSuggestion` | `cameraPreset` | `camera` (ANGLES key) | enum only |

> `cardPosition` is **deferred** (research §6 recommendation — geometry nudges are higher-risk from a single image). Add only if evals show it's needed.

## 5.3 Symptom → knob direction assertions (the eval's anti-pattern muscle)

These are codifiable **sign-agreement checks** the offline harness asserts against the labelled set. They encode the DOMAIN "iron law" so the eval *catches* a model that learns the wrong reflex.

| Symptom (from DOMAIN table) | Correct delta direction | FORBIDDEN move the eval must catch |
|------------------------------|-------------------------|-------------------------------------|
| Milky/cloudy diamond (`milky=true`) | `worldStrengthDelta < 0` AND/OR `cardDarknessDelta > 0` | **`exposureDelta > 0`** — raising brightness to fix milkiness is the #1 forbidden anti-pattern |
| Blown metal highlights (`blownHighlights=true`) | `exposureDelta < 0` first | raising exposure |
| Plastic/flat metal | `cardDarknessDelta > 0` (+ reposition) | **`worldStrengthDelta > 0`** to "brighten" metal → causes milkiness |
| White gold reads pure-white (`wrongMetal=true`, white-gold ctx) | `worldStrengthDelta < 0` | raising worldStrength/exposure |
| Whole image washed-out / milky overall | `worldStrengthDelta < 0` (prefer before exposure) | — |
| Front stone edge-on / dull on `front` | `cameraPresetSuggestion = "front"` (lower camera) | trying to fix with light knobs |
| Floating product (metal/full pass) | `contactShadowDelta > 0` | applying on a **stone** pass (transparent) |
| Heavy/dirty contact shadow | `contactShadowDelta < 0` | — |
| Broken holdout / wrong-pass (`brokenHoldout=true`) | **NO knob** — escalate to human | any exposure/card "fix" attempt |

## 5.4 Measurement approach summary

- **Code-based (first, cheap, deterministic):** schema `.parse()`; every delta inside `KNOB_RANGES`; `clamp()` backstop; iteration/cost budget; `overallScore` monotonic-improvement check; D6 pass-type gate (no shadow scoring on stone passes); D8 alpha-channel sanity check on stone passes (is the corner pixel transparent?). **Sign-agreement** assertions from §5.3.
- **LLM judge (the vision model itself, calibrated):** D1–D8 quality scores + flags + delta direction. **Must be calibrated against human labels before auto-correct is trusted** (target judge↔human agreement **≥ 0.7**, per DOMAIN expert-roles + ai-evals.md Verify-phase guidance).
- **Human review:** the QA lead labels the reference set and signs off the accept bar; the senior render operator reviews **every** AI-recommended correction in the first batches and owns the escalate edge cases. In production, human-in-the-loop accept/reject is **always present** (Section 7).

## 5.5 Accept / reject contract ("catalog-ready" bar)

Direct from DOMAIN §"Accept / Reject Bar," expressed as code-evaluable conditions on the verdict.

```ts
// lib/intelligence/loop.ts (pure, testable)
const GOOD_ENOUGH = 4;       // overallScore early-exit gate (research §4)
const MAX_ITERATIONS = 2;    // hard cap (research §4)

// ACCEPT → proceed to FINAL render with current overrides:
const accept =
  s.diamondBrilliance >= 4 &&        // D1 gate
  s.metalBelievability >= 4 &&       // D3 gate
  s.metalHighlight >= 3 &&           // D2 floor
  s.backgroundHoldout >= 3 &&        // D8 floor
  noDimensionEqualsOne(s) &&         // no hard 1 anywhere
  v.overallScore >= GOOD_ENOUGH;

// Hard gates — a single one = NOT catalog-ready regardless of other scores:
const hardGateFail = flags.milky || flags.wrongMetal || flags.brokenHoldout;

// ESCALATE-TO-HUMAN (do NOT loop — out of knob scope):
const escalate =
  flags.brokenHoldout ||             // grouping/token issue, not a light knob (DOMAIN symptom 10)
  flags.emptyOrBroken ||             // structural failure
  (iteration >= MAX_ITERATIONS && !accept); // caps exhausted without crossing the bar

// AUTO-CORRECT (apply clamped deltas, re-preview) when:
const autoCorrect =
  !accept && !escalate &&
  hasNonZeroDelta(v.adjust) &&
  iteration < MAX_ITERATIONS &&
  improvedOverPrevious(v.overallScore); // stop-on-no-improvement (research §4)
```

**Decision priority (evaluated in order):** `escalate` → `accept` → `autoCorrect` → else **freeze best overrides** and proceed to FINAL with the best-scoring set seen so far (never a regressed one).

- **Early exit:** `overallScore ≥ 4` and no hard flags → skip straight to FINAL on the first analysis (most renders should exit here).
- **Stop-on-no-improvement:** if a new iteration's `overallScore` does not beat the previous (Δ ≤ 0), stop and freeze the **best** override set.
- **Escalate (never silent, never loop):** broken holdout, structurally empty/broken render, or caps exhausted below the bar → surface to operator with scores + rationale.

## 5.6 Eval tooling

**Detection result:** no eval platform (Langfuse/LangSmith/Arize Phoenix/RAGAS/Braintrust/Promptfoo) is installed in the repo. This is a TypeScript / Next.js + Vercel AI SDK project with no Python data-science stack, no RAG, no LangChain. Phoenix/RAGAS (Python, RAG-oriented) would be a poor architectural fit. We therefore use a **lightweight in-repo harness** consistent with the repo's existing zod-validated, deterministic-test stance (`test/*.test.ts`, e.g. `test/orch-progress.test.ts`).

| Concern | Tool | Rationale |
|---------|------|-----------|
| Offline rubric/judge eval | **In-repo TS fixture harness** (`test/intelligence/`), zod-validated, runs under the existing test runner | Matches repo conventions; no new platform/account; asserts judge output is within ±1 of human label per dimension + delta sign-agreement (§5.3). |
| Prompt regression in CI | **Promptfoo** (CLI-first, no account) — *optional, additive* | If/when the vision prompt is iterated, a `promptfooconfig.yaml` over the same labelled fixtures gives prompt-diff regression in CI without a hosted platform. CLI-only, fits the Vercel/CI model. |
| Tracing / observability | **Job.intel JSON column + the operator monitor UI** (Section 7) | The loop already persists every verdict, delta, iteration, and cost on the `Job` row. That *is* the trace. A hosted tracer adds infra weight with no marginal value at this volume; revisit only if loop volume grows large. |

> Install (only if Promptfoo CI step is adopted): `npm i -D promptfoo` then `npx promptfoo eval -c test/intelligence/promptfooconfig.yaml`.

## 5.7 Reference dataset spec (validate the rubric BEFORE trusting auto-correct)

- **Size:** **10–20 labelled preview PNGs** (ai-evals.md: start with 10–20 high-quality, not 200 mediocre). Minimum **12** for v1.
- **Composition (must cover):**
  - **Known-good** references — `outputs/ring99/*` (the proven catalog renders; expected D1/D3 ≥ 4, accept).
  - **Known-bad** references — the broken **zanessa** renders (expected hard-gate failures: milky stone, off metal, and/or broken holdout).
  - **Per-metal coverage:** at least one each of white / yellow / rose gold (the three D3 risk profiles).
  - **Per-angle coverage:** at least one each of hero / front / top / profile.
  - **Failure-mode coverage:** at least one example of each DOMAIN failure mode — milky diamond, white-gold-as-chrome, blown highlights, flat metal, holdout fringing (→ escalate), floating product.
  - **Adversarial:** one structurally-empty/black frame (expects `emptyOrBroken=true`, escalate, no deltas).
- **Labeling approach:** the **Catalog/Retouching QA lead** assigns the 1–5 score per dimension and the accept/reject verdict; the **senior render operator** labels the expected knob-delta *direction* (sign) per case. Domain experts label — not engineers (ai-evals.md pitfall #2).
- **Calibration step (gate before auto-correct ships):**
  1. Run `analyzePreview` over the full labelled set.
  2. Assert each dimension lands **within ±1** of the human label.
  3. Assert **delta sign-agreement** with the operator labels for every non-accept case (this is what catches the "raise brightness to fix milky" anti-pattern).
  4. Assert all three **hard gates** fire correctly on the zanessa bad set.
  5. Compute judge↔human agreement; **require ≥ 0.7 before enabling auto-correct in production.** Below 0.7 → the loop runs in **score-and-recommend-only** mode (operator applies/declines; no auto re-preview).
- **Timeline:** build the labelled set **during implementation**, not after (ai-evals.md Execute-phase). The harness must be green before the "Optimize with AI" toggle is exposed to operators.

## 5.8 CI/CD integration

```bash
# Offline rubric harness — runs in CI on any change to the prompt, schema, or knob logic:
npx tsx test/intelligence/run-eval.ts        # asserts ±1 per-dimension + delta sign + hard gates
# (optional) prompt regression if Promptfoo adopted:
npx promptfoo eval -c test/intelligence/promptfooconfig.yaml --no-cache
```
The harness uses fixture PNGs committed under `test/intelligence/fixtures/` (or referenced by private blob path with cached verdicts to avoid burning vision calls on every CI run — cache the model verdicts; re-record only when the prompt changes).

---

# Section 6 — Guardrails

## 6.1 Online guardrails (run on every loop iteration, real-time, must be fast)

These protect against catastrophic loop behavior. They are cheap, deterministic, and run **before any value reaches a recipe or any extra GPU render is dispatched**.

| # | Guardrail | Trigger | Action |
|---|-----------|---------|--------|
| G1 | **Schema validation** | `generateObject` output (or `generateText` fallback) fails `visionVerdictSchema.parse()` | Reject the verdict; do not iterate; mark job for operator review (treat as `emptyOrBroken`). A malformed/hallucinated structure can never drive a render. |
| G2 | **Delta range-bounding (two layers)** | (a) schema `.min()/.max()` rejects out-of-range deltas at parse time; (b) `clamp(value, KNOB_RANGES[k])` in `applyDeltas` | Belt-and-suspenders: a hallucinated knob value is clamped to the safe range before `buildEnterpriseRecipe` ever sees it. **No out-of-range value reaches Blender.** |
| G3 | **`MAX_ITERATIONS = 2` hard cap** | `iteration >= 2` | Stop the loop; freeze best overrides; proceed to FINAL. Hard upper bound on GPU spend (research §4). |
| G4 | **Stop-on-no-improvement (anti-oscillation)** | new `overallScore` ≤ previous (Δ ≤ 0) | Stop; **freeze the best-scoring override set** (never ship a regressed one). Kills over-correction oscillation. |
| G5 | **Forbidden-move guard** | `flags.milky=true` **and** `adjust.exposureDelta > 0` (raising brightness to fix milkiness) | **Zero out the exposure delta** for that iteration and log a `forbidden_move` warning to `Job.intel`. Enforces the DOMAIN iron law even if the model regresses. Same guard for "↑ worldStrength to fix flat metal." |
| G6 | **Escalate-not-loop short-circuit** | `flags.brokenHoldout=true` OR `flags.emptyOrBroken=true` | Do **not** apply deltas, do **not** re-preview. Surface to operator (grouping/token or structural issue — out of knob scope, DOMAIN symptom 10). |
| G7 | **Pass-type knob gate** | `contactShadowDelta != 0` on a **stone** (transparent) pass | Drop the contact-shadow delta (shadows are N/A on stone passes). |
| G8 | **Cost cap** | cumulative per-job count exceeds **≤2 vision calls + ≤2 preview renders + 1 final** | Halt the loop; freeze best; proceed to FINAL. Surface cumulative counts in the monitor so a runaway is visible. |
| G9 | **Kill switch** | `ADAPTIVE_INTELLIGENCE_ENABLED=false` (global env) OR per-batch toggle OFF OR `OPENAI_API_KEY` absent | Bypass the loop entirely; batch renders the classic path. Single revert lever (research §4/§7). |
| G10 | **Single-quality-source rule** | — (architectural invariant, enforced by types) | The loop **only** produces a `profileOverrides` object of named knobs. It **never** hand-builds or edits recipe JSON. `buildEnterpriseRecipe` remains the single source of render quality; overrides are an optional, additive, clamped input. |

## 6.2 Offline flywheel (sampled batch, feeds the improvement loop)

Quality signals reviewed periodically, not on the hot path.

| Metric | Source | What it drives |
|--------|--------|----------------|
| Judge↔human agreement drift | Re-score the labelled reference set + a sample of production verdicts the operator accepted/rejected | If agreement drops below 0.7, demote auto-correct to recommend-only and recalibrate the prompt. |
| Operator override rate | `Job.intel` accept/reject vs. AI verdict | High override rate on a metal/angle → the per-metal/per-angle weighting (§5.1) needs a prompt hint. |
| Forbidden-move (G5) frequency | `Job.intel.forbidden_move` log | Rising frequency → the prompt's anti-pattern instruction is weakening; reinforce it. |
| Convergence/iteration distribution | `Job.intel.iteration`, score deltas | How often the loop hits the cap vs. early-exits; tunes `GOOD_ENOUGH` / `MAX_ITERATIONS` (calibratable). |
| Score-improvement per knob | Pre/post `overallScore` keyed by which delta was applied | Validates the symptom→knob table empirically; feeds back into the prompt. |
| GPU cost per accepted render | preview + final render counts × GPU minute | Watches the real cost (GPU dwarfs vision tokens, research §4). |

---

# Section 7 — Production Monitoring

## 7.1 Tracing / observability

The **`Job.intel` JSON column is the trace** (additive nullable column, research §5). No external tracer. Every loop persists a complete, idempotent, replayable record.

**Logged per loop iteration (the audit trail):**

| Field | Purpose |
|-------|---------|
| `intelState` | state-machine position (`PREVIEW_QUEUED` → `ANALYZING` → `ADJUSTED` → `FINAL_QUEUED` → `DONE`) — from research §5 |
| `iteration` | 0..MAX_ITERATIONS |
| `verdicts[]` | full `VisionVerdict` per iteration (D1–D8 scores, flags, deltas, `overallScore`, `rationale`) |
| `appliedOverrides[]` | the **clamped** `profileOverrides` actually used each iteration (post-G2/G5/G7) |
| `bestScore` / `bestOverrides` | the frozen best-scoring set (what FINAL ships) |
| `decision` | `accept` / `autoCorrect` / `escalate` / `freeze-best` per iteration |
| `guardrailHits[]` | any of G3–G8 that fired (esp. `forbidden_move`, `cost_cap`, `no_improvement`) |
| `cost` | `{ visionCalls, previewRenders, finalRenders }` cumulative |
| `operatorAction` | `accepted` / `rejected` / `overrode` + timestamp + user (set when the human reviews) |

## 7.2 Human-in-the-loop review (always on, never silent)

Per the phase constraint and DOMAIN expert roles, the operator **always** sees the AI's scores + reasoning and can accept or reject — the AI never ships an image silently.

- The batch/job monitor UI renders, per intelligence job: the **preview thumbnail**, the **D1–D8 score bars**, the **flags**, the **applied knob deltas**, the **`rationale` string**, and the **final accept/reject decision** the loop reached.
- The operator can **Accept** (ship the AI's frozen-best FINAL), **Reject** (discard, re-queue classic, or hand-correct), or **Override** (manually pick a different iteration's overrides). The action is logged to `Job.intel.operatorAction`.
- **Escalations (G6: broken holdout / empty-broken / caps-exhausted)** are surfaced as a distinct "needs human" state — the operator sees *why* it escalated (e.g. "broken holdout — grouping/token issue, not fixable by light knobs").

## 7.3 Key metrics & alert thresholds (code-based, automated)

| Metric | Alert threshold (calibratable assumption) | Why |
|--------|-------------------------------------------|-----|
| Per-job vision calls | **> 2** | Cost cap breach (G8) — should be impossible; alert = bug. |
| Per-job preview renders | **> 2** | GPU budget breach (G8). |
| Escalation rate | **> 25%** of intelligence jobs over a rolling window | Rubric or pipeline problem (e.g. systemic holdout breakage) — investigate. |
| Operator reject rate | **> 30%** | Judge↔human divergence (ai-evals.md signal-metric divergence) — recalibrate. |
| Forbidden-move (G5) hits | **> 5%** of corrections | Prompt anti-pattern instruction weakening. |
| Loop reaching MAX_ITERATIONS without accept | **> 40%** | `GOOD_ENOUGH`/`MAX_ITERATIONS` mistuned, or knobs insufficient. |
| Vision call latency | **> 60s p95** | `gpt-5.5-pro` is slow (research §4, maxDuration 300); track for timeout risk. |

## 7.4 Sampling strategy

- **Online (every interaction):** guardrails G1–G10 run on **every** loop, always. There is no sampling on safety/cost guardrails.
- **Offline flywheel (smart sampling):** weight the review sample toward **concerning signals** (ai-evals.md Monitor-phase) — jobs that escalated, jobs the operator **rejected/overrode**, jobs that hit `MAX_ITERATIONS`, and any `forbidden_move`/`cost_cap` guardrail hit. These are re-scored against human judgment to feed the flywheel (§6.2).
- **Signal-metric divergence watch:** when the **operator override rate** diverges from the AI's **`overallScore`** (model says "accept," human rejects), that pair is the early-warning that the rubric/prompt has drifted — auto-flag for the eval engineer.

---

## Appendix — Calibratable assumptions (tune against the reference dataset; do NOT block on them)

| Assumption | Default | Calibrate via |
|------------|---------|---------------|
| Early-exit gate | `overallScore >= 4` | reference set: does 4 reliably correspond to QA-lead "ship"? |
| Accept floors | D1≥4, D3≥4, D2≥3, D8≥3, no dim=1 | QA-lead labels |
| Iteration cap | `MAX_ITERATIONS = 2` | convergence distribution (§6.2) |
| Judge-trust threshold | agreement **≥ 0.7** before auto-correct | calibration step (§5.7) |
| Per-dimension tolerance | within **±1** of human label | calibration step |
| Escalation-rate alert | > 25% | production baseline |
| Operator-reject alert | > 30% | production baseline |
| Delta schema bounds | `worldStrength ±0.05`, `exposure ±1`, `cardDarkness ±0.4`, `contactShadow ±0.1` (per-iteration) | from research §3; tighten if oscillation observed |

All thresholds are documented as **calibratable** and get tuned against the labelled reference dataset during execution. They are **not** blocking questions for the spec.

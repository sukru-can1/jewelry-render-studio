# 09 — Adaptive Render Intelligence: AI Research

**Question answered:** How do we correctly engineer a reliable, cost-bounded *vision-guided adaptive render loop* on top of the existing Jewelry Render Studio pipeline, using OpenAI `gpt-5.5-pro` (multimodal) via the **Vercel AI SDK v6**?

**System type:** Autonomous (bounded, vision-in-the-loop) render-intelligence controller.
**Framework:** Vercel AI SDK v6 (`ai@^6`) + `@ai-sdk/openai@^3`.
**Model provider:** OpenAI — `gpt-5.5-pro` (vision + structured output via the Responses API the SDK uses).

> The loop being engineered:
> **preview render (low samples)** → **`gpt-5.5-pro` VISION analysis of the preview PNG** (structured 1–5 scores + bounded knob deltas) → apply deltas as `profileOverrides` to `buildEnterpriseRecipe` → **final render** (or re-preview, capped iterations).

---

## Assumptions (explicit — flagged unknowns)

These could not be confirmed from docs at research time and must be verified once during build (one throwaway call each):

- **A1 — `gpt-5.5-pro` accepts image content parts + structured output in the same call.** Confirmed pattern-wise for `gpt-5` family vision in AI SDK docs; `pro` is assumed identical (Responses API, same content-part shape). *Verify with one call.* The existing `ai-classify.ts` already has the `generateObject` → `generateText` fallback ladder; we reuse it, so if `pro` rejects structured-output-with-vision, the text+safe-parse fallback still validates against the zod schema.
- **A2 — Cost/latency figures** below are order-of-magnitude estimates extrapolated from `gpt-5`-class vision pricing and the observed slowness of `gpt-5.5-pro` (a reasoning model) in `ai-analyze` (maxDuration 300). Treat as planning numbers, refine after first real calls.
- **A3 — Image size.** OpenAI internally tiles images; high-detail tiles cost more tokens. We **downscale the preview to ~768px longest edge and send `imageDetail:"low"`** — confirmed-supported provider option — which is more than enough to score lighting/exposure/framing. We are NOT asking the model to read fine facets.
- **A4 — `gpt-5.5-pro` reasoning effort/verbosity knobs** (if exposed via `providerOptions.openai`) are not relied upon; defaults are assumed acceptable.

---

## 1. Framework Quick Reference — AI SDK v6 vision `generateObject`

### Installation (already present)

```
ai@^6                # generateObject, generateText, content parts
@ai-sdk/openai@^3    # createOpenAI / openai()
zod                  # schema validation
```

No new dependencies required. `lib/inspection/ai-classify.ts` already wires `createOpenAI({ apiKey: env.OPENAI_API_KEY })` and `env.AI_MODEL ?? "gpt-5.5-pro"`.

### Imports

```ts
import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { env } from "@/lib/env";
```

### Key abstractions

| Abstraction | What it is | Use in this loop |
|-------------|-----------|------------------|
| `generateObject({ model, schema, messages })` | Provider-native structured output, zod-validated by the SDK | The single vision-analysis call; returns the scored verdict |
| `messages` + content parts | `{ type:"image", image }` + `{ type:"text", text }` in a `user` message | How the preview PNG (base64 data URL) + prompt reach the model |
| `providerOptions.openai.imageDetail` | `"low" \| "high" \| "auto"` per image part | Set `"low"` — caps image token cost for a 1MP preview |
| `maxOutputTokens` | Hard output cap | Set explicitly (reasoning headroom + small JSON) — never unbounded |
| `generateText` + safe JSON parse | Fallback when structured-output-with-vision is unsupported | Reuse the existing ladder from `ai-classify.ts` |

### Minimal entry point — the vision call (copy-paste shape)

```ts
// lib/intelligence/analyze-preview.ts  (new)
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { env } from "@/lib/env";

// --- 4b.1: the structured verdict schema (zod = the contract) ---
const score = z.number().int().min(1).max(5); // discrete 1..5 only

export const visionVerdictSchema = z.object({
  scores: z.object({
    exposure: score,        // 1 too dark .. 5 too blown; 3 = ideal
    metalContrast: score,   // facet/edge definition on the metal
    stoneSparkle: score,    // life in the gemstone(s)
    framing: score,         // subject size + centering in frame
    background: score,      // clean studio sweep, no banding/dirt
  }),
  flags: z.object({
    clipping: z.boolean(),       // blown highlights present
    tooDark: z.boolean(),
    offCenter: z.boolean(),
    emptyOrBroken: z.boolean(),  // nothing rendered / obvious failure
  }),
  // RELATIVE deltas (see §3) — bounded, the model proposes nudges not absolutes:
  adjust: z.object({
    worldStrengthDelta: z.number().min(-0.05).max(0.05),
    exposureDelta: z.number().min(-1).max(1),
    cardDarknessDelta: z.number().min(-0.4).max(0.4),
    contactShadowDelta: z.number().min(-0.1).max(0.1),
  }),
  overallScore: score,           // single gate number for early-exit
  rationale: z.string().max(600),// short, for the audit trail / monitor UI
});

export type VisionVerdict = z.infer<typeof visionVerdictSchema>;

const SYSTEM = `You are a jewelry catalog-photography QA expert grading ONE studio
render of a single piece of jewelry on a white sweep. Grade ONLY what you can see.
Scores are integers 1-5 where 3 = ideal/neutral, 1 and 5 = the two failure extremes
(per-axis legend given by the field name). If you cannot judge an axis, return 3 and
set the matching flag false. Propose adjust deltas ONLY when a score is not 3, and
keep every delta inside its allowed range. Never invent objects or defects.`;

export async function analyzePreview(
  pngBytes: Buffer,            // already downscaled to ~768px, see §2
  context: { metal: string; stoneGroup: string; angle: string },
): Promise<VisionVerdict> {
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY! });
  const model = openai(env.AI_MODEL ?? "gpt-5.5-pro");

  const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;

  const { object } = await generateObject({
    model,
    schema: visionVerdictSchema,
    schemaName: "RenderVisionVerdict",
    system: SYSTEM,
    maxOutputTokens: 4096, // reasoning headroom + tiny JSON; bounded on purpose
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Render context: metal=${context.metal}, stoneGroup=${context.stoneGroup}, ` +
              `angle=${context.angle}. Grade this preview and propose bounded knob deltas.`,
          },
          {
            type: "image",
            image: dataUrl,                       // base64 data URL (private blob, §2)
            providerOptions: { openai: { imageDetail: "low" } }, // A3 — cost cap
          },
        ],
      },
    ],
  });

  return visionVerdictSchema.parse(object); // defensive re-parse (matches ai-classify)
}
```

> The `generateText` + `safeParseJsonObject` fallback (already written in `ai-classify.ts`) should be lifted verbatim around this call so an unexpected structured-output rejection on `pro` (A1) degrades gracefully instead of throwing.

### Folder layout (additive — follows repo conventions)

```
lib/intelligence/
  analyze-preview.ts     # the vision call + schema (above)
  knobs.ts               # profileOverrides type, ranges, clamp(), applyDeltas()
  loop.ts                # state-machine transitions (pure, testable)
app/api/intelligence/
  analyze/route.ts       # nodejs, maxDuration 300 — runs analyzePreview on preview-complete
```

### Sources

- AI SDK — Prompts / image content parts: https://ai-sdk.dev/docs/foundations/prompts
- AI SDK — OpenAI provider, local image + `imageDetail`: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- AI SDK — Generating structured data (`generateObject` / `Output.object`, schema validation): https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- Existing in-repo pattern: `lib/inspection/ai-classify.ts` (generateObject → generateText fallback, zod re-parse)

---

## 2. Getting the PRIVATE preview image to the model

The preview is a **private** Vercel Blob (no signed-delivery URL — see `lib/blob.ts` / `app/api/file/route.ts`). We cannot hand the model a URL. Path:

1. **Fetch bytes server-side** with `get(pathname, { access: "private" })` (same call the `/api/file` proxy uses). Read `result.stream` into a Buffer.
2. **Downscale + re-encode before sending** (A3). Use `sharp` (or Pillow if pushed to the worker) to resize the longest edge to ~768px PNG. A full 1920×1920 preview is wasteful — the model is judging lighting/framing, not facets.
3. **Base64 → data URL** into the `{ type:"image", image }` content part, with `imageDetail:"low"`.

```ts
import { get } from "@vercel/blob";
import sharp from "sharp";

async function previewBytes(pathname: string): Promise<Buffer> {
  const res = await get(pathname, { access: "private" });
  if (!res || res.statusCode !== 200) throw new Error("preview blob missing");
  const raw = Buffer.from(await new Response(res.stream).arrayBuffer());
  // Downscale to bound image tokens (~1MP -> ~0.6MP @ 768px long edge).
  return sharp(raw).resize({ width: 768, height: 768, fit: "inside" }).png().toBuffer();
}
```

**Limits / notes**
- The AI SDK accepts a `Buffer`, `Uint8Array`, base64 string, or data URL for the `image` part. A data URL is the most explicit for a private asset. Either Buffer or data URL works; data URL avoids ambiguity about MIME.
- OpenAI tiles images; `imageDetail:"low"` charges a flat small token count per image (no per-tile blowup). That is the cost lever (§4).
- **Do NOT** route the preview through `/api/file` (that proxy requires a browser session) — the analyze step runs server-side and reads the blob directly.

---

## 3. Reliability of structured visual scoring (prompt discipline)

Goal: consistent, low-variance verdicts a control loop can trust.

- **Discrete 1–5 integers, not floats.** `z.number().int().min(1).max(5)`. A vision model is far more consistent on a 5-point ordinal scale than on continuous scores.
- **Anchor "3 = ideal", 1 and 5 = the two failure poles.** Put the per-axis legend in the *field name* and the system prompt, so the model self-calibrates. This collapses "is 4 good or bad?" ambiguity.
- **Ask for RELATIVE deltas, not absolute knob values.** The model never sees the current recipe numbers; it only sees the image. It is reliable at "this is too dark, nudge exposure up a bit," unreliable at "set exposure to -0.31." Deltas are **range-bounded in the schema itself** so a hallucinated value is rejected/clamped before it can touch a recipe. (Strong recommendation.)
- **Constrain hallucination:** system prompt says "grade ONLY what you can see," "if you cannot judge an axis return 3," "never invent objects." Provide render context (metal/stone/angle) as text so the model isn't guessing intent.
- **`overallScore` is the single early-exit gate** — one field, not a derived combination, so the loop's exit condition is unambiguous.
- **`rationale` (≤600 chars)** is for the operator/monitor audit trail, never parsed by code.
- Keep `temperature` at the model default low; do not raise it.

---

## 4. Cost & latency reality → iteration caps

**Per vision call (estimate, A2):**
- Image at `imageDetail:"low"`, ~768px: ~hundreds of input tokens for the image + small text prompt; output is a tiny JSON object but `gpt-5.5-pro` spends hidden reasoning tokens.
- **Latency:** expect **multi-second to tens-of-seconds** per call (it is the same slow reasoning model that drove `ai-analyze` to `maxDuration 300`). The analyze call comfortably fits one `nodejs`/`maxDuration:300` function.
- **Cost:** order **~$0.01–$0.05 per analysis call** at this image size/output budget. The dominant real cost is the **GPU render**, not the vision call.

**Implication for the loop — hard caps:**
- **`MAX_ITERATIONS = 2`** preview→analyze cycles (i.e. at most: preview → analyze → adjusted preview → analyze → final). Each extra iteration is a *full GPU render*, which dwarfs the vision cost — GPU spend, not token spend, is what bounds this.
- **Early exit:** if `overallScore >= GOOD_ENOUGH (= 4)` **and** no hard flags (`clipping|tooDark|emptyOrBroken`) → skip straight to FINAL with current overrides. Most renders should exit on the first analysis.
- **Non-convergence guard:** if a new iteration's `overallScore` does **not improve** over the previous (Δ ≤ 0), stop iterating and proceed to FINAL with the **best-scoring** override set seen so far (never the latest if it regressed).
- **Total budget per job:** ≤ 2 vision calls + ≤ 2 preview renders + 1 final render. Vision cost per job ≈ ≤ $0.10; negligible beside GPU.
- **Kill switch:** a single env/flag (`ADAPTIVE_INTELLIGENCE_ENABLED`) and a per-batch boolean. When off, the loop is bypassed and the batch renders exactly as today.

---

## 5. Orchestration on Vercel + RunPod — the loop state machine

The loop spans **multiple async GPU renders**, so it **cannot** be one 300s function. It must be driven by the **existing webhook + reconcile** machinery (`lib/orchestration/{dispatch,webhook,reconcile,status-map}.ts`). The vision analysis is triggered **when a preview render completes** — exactly where `applyWebhookResult()` already runs on completion.

### State machine (persisted, idempotent)

States live on the **Job** (add an `intel` JSON column / new `RenderIntel` row — see below), distinct from the RunPod `JobStatus`:

```
PREVIEW_QUEUED ──(preview render dispatched as a normal low-sample Job)──┐
      │                                                                   │
      ▼ (RunPod COMPLETED webhook for the preview job)                    │
   ANALYZING ──(analyzePreview() runs, vision verdict persisted)──────────┘
      │
      ├─ overallScore>=4 & no hard flags ──────────────► ADJUSTED (no-op deltas)
      │
      ├─ deltas present & iteration < MAX & improving ─► ADJUSTED ─► re-dispatch preview ─► PREVIEW_QUEUED
      │
      └─ caps hit / converged ─────────────────────────► ADJUSTED (freeze best overrides)
      ▼
  FINAL_QUEUED ──(dispatch full-sample Job with frozen profileOverrides)──► (RunPod COMPLETED)
      ▼
    DONE
```

### Mapping onto the existing dispatch/webhook/reconcile pattern

- **Preview and final are ordinary `Job` rows** (reuse `dispatchQueuedJobs`, the optimistic `queued→submitted` claim, the absolute webhook URL with secret). A flag on the job marks it a *preview* (low samples) vs *final*. **No new dispatch path.**
- **The trigger point is `applyWebhookResult()`'s `completed` branch** (`lib/orchestration/webhook.ts`). Today on completion it writes `result` and calls `deriveLayerFromResult`. Add: *if this completed job is an intelligence-preview, advance the intel state machine* — i.e. enqueue an `ANALYZING` step. Because the webhook already runs `findFirst({where:{runpodJobId}})` to get `job.id`, the hook has everything it needs.
- **Do NOT run the (slow, 10–30s) vision call inside the webhook handler.** The webhook must stay fast and return 200 (RunPod retries on slow/failed callbacks). Instead, the webhook flips intel state to `ANALYZING` and the actual `analyzePreview()` runs in a **separate `nodejs`/`maxDuration:300` step**: either (a) the `analyze` cron tick picks up jobs in `ANALYZING` (mirrors `reconcileJobs`), or (b) `after()`/a fire-and-forget call to `POST /api/intelligence/analyze`. Recommendation: **a cron-driven `ANALYZING` sweep**, identical in shape to `reconcileJobs` — it inherits idempotency and the at-least-once safety net for free.
- **Idempotency (mirror webhook.ts):** every intel transition is a guarded `updateMany` (`where: { intelState: <expected> }`). A duplicate preview-complete callback that already advanced the state matches zero rows → no double analysis, no double re-dispatch. The analyze sweep claims a job by flipping `ANALYZING → ANALYZED` optimistically (count===1 wins), exactly like the `queued→submitted` claim in `dispatch.ts`.
- **Reconcile fallback:** `reconcileJobs` already polls non-terminal jobs and replays through `applyWebhookResult`. A dropped preview-complete webhook is therefore recovered by the existing cron, which advances the intel state the same way — no second code path.
- **Persistence (additive, schemaless-friendly):** add to `Job` a nullable `intelState String?` + `intel Json?` (verdicts, iteration count, best-override set, best score). Backward-compatible additive column, consistent with the repo's "additive, no migrations pain" stance. Non-intelligence jobs leave both null and behave exactly as today.

---

## 6. The `profileOverrides` contract

`buildEnterpriseRecipe` must accept a **minimal, named-knob** object so the AI's output maps cleanly to recipe inputs — the AI **never** hand-builds recipe JSON. Add one optional field to `EnterpriseRecipeRequest`:

```ts
// lib/intelligence/knobs.ts
export type ProfileOverrides = {
  worldStrength?: number;        // world.strength            — light: 0.04 .. 0.20  (recipe default 0.105)
  exposure?: number;             // render.exposure           — light: -1.5 .. 0.3   (recipe default -0.58)
  cardDarkness?: number;         // reflection_cards darkness — 0.0 (black) .. 0.5   (scales card .color)
  cardPosition?: number;         // optional lateral nudge    — -0.5 .. 0.5 scene units (DEFER if unused)
  contactShadowStrength?: number;// contact_shadows[].alpha   — 0.04 .. 0.22 (recipe default 0.115)
  cameraPreset?: "hero" | "front" | "top" | "profile"; // maps to existing ANGLES key
};

// Safe ranges — clamp BEFORE the recipe ever sees a value (guardrail, §7).
export const KNOB_RANGES = {
  worldStrength: [0.04, 0.20] as const,
  exposure: [-1.5, 0.3] as const,
  cardDarkness: [0.0, 0.5] as const,
  cardPosition: [-0.5, 0.5] as const,
  contactShadowStrength: [0.04, 0.22] as const,
};

export function clamp(n: number, [lo, hi]: readonly [number, number]) {
  return Math.min(hi, Math.max(lo, n));
}
```

**How the AI's relative deltas become absolute overrides (`applyDeltas`):**
- Take the *current* recipe's knob values (known on the server, NOT shown to the model), add the schema-bounded `adjust.*Delta`, then `clamp()` to `KNOB_RANGES`. The clamped result is the new `profileOverrides`.
- `buildEnterpriseRecipe` applies overrides at the end: `world.strength`, `render.exposure`, each `reflection_cards[].color` (scaled by `cardDarkness`), `contact_shadows[].alpha`, and `cameraPreset` selects the `ANGLES` entry. Defaults are untouched when an override is `undefined` (purely additive — existing batches unaffected).
- **Recommendation:** ship `worldStrength`, `exposure`, `cardDarkness`, `contactShadowStrength`, `cameraPreset` in v1. **Defer `cardPosition`** (geometry nudges are higher-risk and harder for the model to reason about from one image) unless evals show it's needed.

This keeps the AI surface tiny and typed: model emits 4 bounded deltas → server clamps → `profileOverrides` → `buildEnterpriseRecipe`. No free-form JSON ever crosses the boundary.

---

## 7. Guardrails / evals

- **Schema validation:** `generateObject` validates against `visionVerdictSchema`; we re-`.parse()` defensively (matches `ai-classify.ts`). The `generateText` fallback re-validates the same schema, so both paths yield identical, trusted shapes.
- **Range-bounding at two layers:** (1) the schema's `.min()/.max()` on every delta rejects out-of-range model output; (2) `clamp()` in `applyDeltas` is the belt-and-suspenders backstop before any value reaches a recipe. A hallucinated knob value can never reach Blender.
- **Kill switch / toggle:** `ADAPTIVE_INTELLIGENCE_ENABLED` env + per-batch boolean. Off → loop bypassed entirely, classic render path. This is the single revert lever.
- **Non-convergence detection:** track `iteration` and `bestScore` in `Job.intel`. Stop and freeze the best-scoring overrides if `iteration >= MAX_ITERATIONS (2)` **or** a new verdict does not improve `overallScore`. Never ship a regressed override set to FINAL.
- **Hard-flag short-circuit:** `emptyOrBroken === true` → do NOT iterate (the model can't fix a structurally broken render with light knobs); mark the job for operator review instead of burning more GPU.
- **Eval harness (offline):** keep a small fixture set of preview PNGs with human-assigned 1–5 scores; assert `analyzePreview` lands within ±1 of the human score per axis and that deltas point the right direction (sign agreement). Run before changing the prompt. (Pattern aligns with the repo's existing zod-validated, deterministic-test stance.)
- **Cost guard:** the per-job vision budget (≤2 calls) and GPU budget (≤2 preview + 1 final) are enforced by `MAX_ITERATIONS`; surface cumulative call count in the monitor so a runaway loop is visible.

---

## Implementation Guidance (summary)

1. **Model:** `openai(env.AI_MODEL ?? "gpt-5.5-pro")`, `maxOutputTokens: 4096`, `imageDetail:"low"`, ~768px downscaled PNG. Reuse the `generateObject → generateText` fallback ladder from `ai-classify.ts`.
2. **Image path:** `get(pathname,{access:'private'})` → Buffer → `sharp` downscale → base64 data URL content part. Never via `/api/file`.
3. **Loop control:** preview/final are ordinary `Job`s through `dispatchQueuedJobs`. The completion **webhook flips intel state to `ANALYZING` only** (stays fast); a cron `ANALYZING` sweep (shaped like `reconcileJobs`) runs the vision call, applies clamped deltas, and either re-dispatches a preview or queues the final. All transitions are guarded `updateMany` (idempotent), recovered by the existing reconcile cron.
4. **Overrides:** model emits 4 bounded deltas → `clamp()` → `profileOverrides` → optional field on `EnterpriseRecipeRequest` → `buildEnterpriseRecipe`. No hand-built JSON.
5. **Caps:** `MAX_ITERATIONS=2`, `GOOD_ENOUGH overallScore>=4`, stop-on-no-improvement, kill switch env + per-batch flag.
6. **Verify A1 once** (`pro` vision + structured output in one call) before wiring the loop; the fallback path covers the failure case.

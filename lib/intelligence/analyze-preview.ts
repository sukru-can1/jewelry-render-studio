// INTEL-02 (Phase 9) — the single vision call of the adaptive render loop.
//
// Sends the downscaled PRIVATE preview (lib/intelligence/preview-image.ts) to
// the OpenAI vision model and returns a schema-validated VisionVerdict. The
// generateObject -> generateText fallback ladder + safeParseJsonObject + the
// defensive zod re-parse are lifted VERBATIM from lib/inspection/ai-classify.ts
// so an unexpected structured-output rejection on the reasoning model degrades
// gracefully — BOTH paths re-validate against visionVerdictSchema (G1: a
// malformed/hallucinated structure can never drive a render).
//
// Server-only: reads OPENAI_API_KEY. Imported solely by the cron ANALYZING
// sweep (lib/intelligence/sweep.ts) — NEVER by the webhook path (T-09-09: the
// webhook must stay fast; this call is multi-second to tens of seconds).
//
// PROMPT SIGN CONVENTION (09-01 carry-over, overrides 09-AI-SPEC §5.3's table):
// cardDarkness is implemented as a brightness MULTIPLIER on the reflection
// cards (lower = darker, identity 1.0) — so a NEGATIVE cardDarknessDelta
// DARKENS the cards. The prompt below encodes that explicitly.

import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { env } from "@/lib/env";
import { previewDataUrl } from "@/lib/intelligence/preview-image";
import { visionVerdictSchema, type VisionVerdict } from "@/lib/intelligence/verdict";

const DEFAULT_MODEL = "gpt-5.5-pro";

// Reasoning headroom + the tiny verdict JSON; bounded on purpose (A2/A4).
const MAX_OUTPUT_TOKENS = 4096;

// The jewelry catalog-photography QA grader (09-AI-SPEC §5.1/§5.2 rubric +
// 09-DOMAIN anchors). Scores are 1 = reject .. 5 = catalog-ready.
const SYSTEM = `You are a jewelry catalog-photography QA expert grading ONE studio render of a single piece of jewelry. Grade ONLY what you can see — never invent objects, defects, or context. Every score is an integer 1-5 where 1 = reject and 5 = catalog-ready. If you cannot judge a dimension from this image, return 3 for it and leave the matching flag false.

THE EIGHT DIMENSIONS:
- diamondBrilliance (D1, HARD GATE): crisp facet micro-contrast, a bright/dark mosaic, visible sparkle that reads as a real diamond. 1 = a uniform pale gray wash with no facet structure — "milky", the #1 failure (set flags.milky).
- metalHighlight (D2): highlights bright but holding gradient and shape; band curvature readable. 1 = large pure-white clipped blobs, silhouette dissolving into the background (set flags.blownHighlights).
- metalBelievability (D3, HARD GATE): reads unmistakably as the intended alloy, lustrous. 1 = plastic/chrome/wrong hue, or white gold gone pure-white (set flags.wrongMetal).
- exposureTonal (D4): full tonal range with true darks present. 1 = washed-out/milky across the frame OR muddy-dark with no contrast.
- stoneSymmetry (D5): the center stone's facet mosaic is near-mirror-symmetric (critical on top/front views).
- contactShadow (D6): a subtle, well-placed grounding shadow. N/A on a transparent stone pass — return 3 there and propose no contactShadowDelta.
- framing (D7): centered, fully in frame, catalog-standard scale.
- backgroundHoldout (D8, HARD GATE): a clean white sweep on a metal/full pass, or clean transparent alpha on a stone pass. 1 = dark fringe/halo, wrong-pass contents, metal visible in a stone pass (set flags.brokenHoldout) — this breaks layered compositing and is NOT fixable by light knobs.
Set flags.emptyOrBroken when nothing rendered / the frame is black or structurally broken, and propose no deltas.

KNOB DELTAS (adjust): propose a non-zero delta ONLY when a score is not catalog-ready, keep every delta inside its schema range, and use 0 for knobs that need no change. Delta semantics:
- worldStrengthDelta: negative DIMS the ambient world light; positive brightens it.
- exposureDelta: negative DARKENS overall exposure (protects highlights); positive brightens.
- cardDarknessDelta: a NEGATIVE cardDarknessDelta makes the reflection cards DARKER (stronger facet/metal contrast); a positive delta brightens them. To darken the cards for readable facets, propose a NEGATIVE delta.
- contactShadowDelta: positive strengthens the grounding shadow; negative weakens a heavy/dirty one.
- cameraPresetSuggestion: a discrete camera recommendation (or null) — e.g. "front" when a front-view stone looks dull/edge-on because the camera sits too high.

IRON LAW (forbidden moves): a milky/washed-out stone means the ambient light is ALREADY TOO HIGH. NEVER propose a positive exposureDelta or a positive worldStrengthDelta to "fix" milkiness — dim the world (negative worldStrengthDelta) and/or darken the cards (NEGATIVE cardDarknessDelta) instead. Flat/plastic metal is fixed with darker cards, never by raising worldStrength. When the holdout is broken (flags.brokenHoldout) propose NO deltas at all — it is a grouping issue that must go to a human.

PER-METAL EMPHASIS: white gold — weight D3/D4/D5 heaviest; pure-white metal is an automatic D3=1 + wrongMetal. yellow gold — weight D2 clipping and the warm D3 hue. rose gold — the pink D3 hue must stay distinct from yellow.
PER-ANGLE EMPHASIS: hero — D1/D3/D4 (tolerate some stone asymmetry). front — D1 and D5; a dull edge-on front stone usually means the camera is too high (suggest "front"). top — D5 symmetry and D7 centering. profile — D2/D3; do NOT penalize stone asymmetry.

overallScore is your single gate number: give 4 or 5 ONLY when the render is catalog-ready. rationale: one short paragraph (max 600 characters) for the operator audit trail.`;

export type AnalyzeContext = {
  metal: string;
  stoneGroup: string;
  angle: string;
  /** "metal" | "stone" — lets the model judge D6/D8 against the right pass. */
  pass?: string;
};

/**
 * Strip Markdown code fences and isolate the first {...} JSON object from a model
 * text response, then JSON.parse it. Lifted verbatim from lib/inspection/ai-classify.ts
 * (the generateText fallback path).
 */
function safeParseJsonObject(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const candidate = start !== -1 && end !== -1 && end > start
    ? fenced.slice(start, end + 1)
    : fenced;
  return JSON.parse(candidate);
}

function contextText(context: AnalyzeContext): string {
  const pass = context.pass ? `, pass=${context.pass}` : "";
  return (
    `Render context: metal=${context.metal}, stoneGroup=${context.stoneGroup}, ` +
    `angle=${context.angle}${pass}. Grade this preview and propose bounded knob deltas.`
  );
}

/**
 * Score one completed preview render with the vision model.
 *
 * - Reads the model from env.AI_MODEL (default "gpt-5.5-pro") and the key from
 *   env.OPENAI_API_KEY; throws a clear Error when the key is missing so the
 *   caller treats it as loop-OFF (G9) rather than failing opaquely.
 * - Fetches + downscales the PRIVATE preview via previewDataUrl (never the
 *   file-proxy route, never a public URL — T-09-05), sent with imageDetail:"low" (A3).
 * - Prefers generateObject (validated structured output). If that throws, falls
 *   back to generateText with a strict JSON instruction + safe parse.
 * - ALWAYS re-validates the result with visionVerdictSchema before returning.
 */
export async function analyzePreview(
  pathname: string,
  context: AnalyzeContext,
): Promise<VisionVerdict> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AI is not configured (OPENAI_API_KEY missing)");
  }
  const modelId = env.AI_MODEL ?? DEFAULT_MODEL;

  const openai = createOpenAI({ apiKey });
  const model = openai(modelId);

  const dataUrl = await previewDataUrl(pathname);

  const imagePart = {
    type: "image" as const,
    image: dataUrl,
    providerOptions: { openai: { imageDetail: "low" } },
  };

  // Preferred path: provider-native structured output, validated by the SDK.
  try {
    const { object } = await generateObject({
      model,
      schema: visionVerdictSchema,
      schemaName: "RenderVisionVerdict",
      system: SYSTEM,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: contextText(context) }, imagePart],
        },
      ],
    });
    // generateObject validates against the schema, but re-parse defensively so
    // the contract is identical on both paths (mirrors ai-classify.ts).
    return visionVerdictSchema.parse(object);
  } catch (structuredError) {
    // Fallback: free-form text with a strict "return ONLY JSON" instruction, then
    // safe-parse + zod-validate. Keeps the loop working if structured output is
    // unsupported/flaky for this vision reasoning model (A1).
    const { text } = await generateText({
      model,
      system: SYSTEM,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                contextText(context),
                "",
                "Return ONLY a JSON object (no prose, no Markdown fences) matching EXACTLY this shape:",
                '{ "scores": { "diamondBrilliance": 1-5, "metalHighlight": 1-5, "metalBelievability": 1-5, "exposureTonal": 1-5, "stoneSymmetry": 1-5, "contactShadow": 1-5, "framing": 1-5, "backgroundHoldout": 1-5 },',
                '  "flags": { "milky": boolean, "wrongMetal": boolean, "brokenHoldout": boolean, "blownHighlights": boolean, "emptyOrBroken": boolean },',
                '  "adjust": { "worldStrengthDelta": -0.05..0.05, "exposureDelta": -1..1, "cardDarknessDelta": -0.4..0.4, "contactShadowDelta": -0.1..0.1 },',
                '  "cameraPresetSuggestion": "hero"|"front"|"top"|"profile"|null,',
                '  "overallScore": 1-5,',
                '  "rationale": string }',
              ].join("\n"),
            },
            imagePart,
          ],
        },
      ],
    });

    let parsed: unknown;
    try {
      parsed = safeParseJsonObject(text);
    } catch {
      throw new Error(
        `Vision analysis failed: structured output errored (${
          structuredError instanceof Error ? structuredError.message : "unknown"
        }) and the text fallback was not valid JSON.`,
      );
    }
    return visionVerdictSchema.parse(parsed);
  }
}

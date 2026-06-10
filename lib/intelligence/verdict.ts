// INTEL-03 (Phase 9) — the structured-output contract the vision model fills.
// 09-AI-SPEC §5.2 verbatim (it SUPERSEDES the 5-field placeholder in
// 09-AI-RESEARCH §1). PURE module: zod only — no prisma/react/sharp/ai.
//
// G1: generateObject validates against this schema and the orchestration layer
// re-.parse()s defensively (mirrors lib/inspection/ai-classify.ts) — a malformed
// or hallucinated structure can never drive a render.
// G2 layer 1: every adjust delta carries hard .min()/.max() bounds; layer 2 is
// clamp(value, KNOB_RANGES) in lib/intelligence/knobs.ts applyDeltas.
import { z } from "zod";

/** Discrete quality score: 1 = reject .. 5 = catalog-ready (09-DOMAIN anchors). */
const score = z.number().int().min(1).max(5);

export const visionVerdictSchema = z.object({
  // --- D1-D8 quality scores (higher = better; 1/3/5 anchors per 09-DOMAIN) ---
  scores: z.object({
    diamondBrilliance: score, // D1 facet micro-contrast / fire (hard gate)
    metalHighlight: score, // D2 clipping / blown whites
    metalBelievability: score, // D3 correct alloy, not plastic/chrome (hard gate)
    exposureTonal: score, // D4 milky-vs-rich overall exposure
    stoneSymmetry: score, // D5 bilateral symmetry (top/front critical)
    contactShadow: score, // D6 grounding (N/A on stone pass)
    framing: score, // D7 crop / centering
    backgroundHoldout: score, // D8 clean bg / clean alpha (hard gate)
  }),

  // --- Hard-flag booleans (drive the hard-gate / escalate logic) ---
  flags: z.object({
    milky: z.boolean(), // D1=1 trigger: uniform pale stone, no facets
    wrongMetal: z.boolean(), // D3=1 trigger: chrome/plastic/pure-white/wrong hue
    brokenHoldout: z.boolean(), // D8=1 trigger: fringing / wrong-pass contents (ESCALATE)
    blownHighlights: z.boolean(), // D2 severe: large clipped white regions
    emptyOrBroken: z.boolean(), // structural failure: nothing rendered / black frame
  }),

  // --- Recommended knob deltas: RELATIVE, signed, schema-bounded (research §3/§6) ---
  // The model never sees current recipe values; it only proposes a nudge.
  adjust: z.object({
    worldStrengthDelta: z.number().min(-0.05).max(0.05), // v to fix milky/over-bright
    exposureDelta: z.number().min(-1).max(1), // more negative protects highlights
    cardDarknessDelta: z.number().min(-0.4).max(0.4), // card readability / contrast
    contactShadowDelta: z.number().min(-0.1).max(0.1), // ^ to ground; v if heavy/dirty
  }),

  // cameraPreset is a discrete recommendation, not a delta (symptom 6/9):
  cameraPresetSuggestion: z.enum(["hero", "front", "top", "profile"]).nullable(),

  overallScore: score, // single early-exit gate number (model-assigned)
  rationale: z.string().max(600), // audit trail for the monitor; never parsed by code
});

export type VisionVerdict = z.infer<typeof visionVerdictSchema>;

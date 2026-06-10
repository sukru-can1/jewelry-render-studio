// INTEL-03 (09-01 Task 3) — G5 forbidden-move + G7 pass-type gate inside
// decideLoop's autoCorrect path. The DOMAIN iron law holds even if the model
// regresses: raising brightness to "fix" milky is zeroed; raising worldStrength
// to "fix" flat metal is zeroed; contact-shadow deltas are dropped on transparent
// stone passes. Every zeroed delta records a guardrail hit for the Job.intel trace.
import { describe, expect, it } from "vitest";

import { decideLoop } from "@/lib/intelligence/loop";
import { visionVerdictSchema, type VisionVerdict } from "@/lib/intelligence/verdict";

type DeepPatch = {
  scores?: Partial<VisionVerdict["scores"]>;
  flags?: Partial<VisionVerdict["flags"]>;
  adjust?: Partial<VisionVerdict["adjust"]>;
  overallScore?: number;
};

function verdict(patch: DeepPatch = {}): VisionVerdict {
  return visionVerdictSchema.parse({
    scores: {
      diamondBrilliance: 2,
      metalHighlight: 3,
      metalBelievability: 3,
      exposureTonal: 3,
      stoneSymmetry: 3,
      contactShadow: 3,
      framing: 4,
      backgroundHoldout: 4,
      ...patch.scores,
    },
    flags: {
      milky: false,
      wrongMetal: false,
      brokenHoldout: false,
      blownHighlights: false,
      emptyOrBroken: false,
      ...patch.flags,
    },
    adjust: {
      worldStrengthDelta: 0,
      exposureDelta: 0,
      cardDarknessDelta: 0,
      contactShadowDelta: 0,
      ...patch.adjust,
    },
    cameraPresetSuggestion: null,
    overallScore: patch.overallScore ?? 3,
    rationale: "guardrail test verdict",
  });
}

describe("G5 forbidden-move — milky", () => {
  it("milky + exposureDelta>0 -> exposureDelta zeroed + forbidden_move:exposure hit; valid deltas survive", () => {
    const result = decideLoop({
      verdict: verdict({
        flags: { milky: true },
        adjust: { exposureDelta: 0.5, worldStrengthDelta: -0.03 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.exposureDelta).toBe(0);
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(-0.03); // the CORRECT milky fix survives
    expect(result.guardrailHits).toContain("forbidden_move:exposure");
  });

  it("milky + worldStrengthDelta>0 -> zeroed too (any exposure/world INCREASE is forbidden when milky)", () => {
    const result = decideLoop({
      verdict: verdict({
        flags: { milky: true },
        adjust: { worldStrengthDelta: 0.04, cardDarknessDelta: -0.2 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(0);
    expect(result.appliedDeltas?.cardDarknessDelta).toBe(-0.2);
    expect(result.guardrailHits).toContain("forbidden_move:worldStrength");
  });

  it("milky + NEGATIVE exposureDelta passes through (only the increase is forbidden)", () => {
    const result = decideLoop({
      verdict: verdict({
        flags: { milky: true },
        adjust: { exposureDelta: -0.4 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.exposureDelta).toBe(-0.4);
    expect(result.guardrailHits).toEqual([]);
  });
});

describe("G5 forbidden-move — flat metal", () => {
  it("flat metal (metalBelievability<=2, not milky) + worldStrengthDelta>0 -> zeroed + hit", () => {
    const result = decideLoop({
      verdict: verdict({
        scores: { metalBelievability: 2 },
        adjust: { worldStrengthDelta: 0.05, cardDarknessDelta: -0.25 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(0);
    expect(result.appliedDeltas?.cardDarknessDelta).toBe(-0.25); // the CORRECT flat-metal fix survives
    expect(result.guardrailHits).toContain("forbidden_move:worldStrength");
  });

  it("healthy metal (metalBelievability>=3, not milky) keeps a positive worldStrengthDelta", () => {
    const result = decideLoop({
      verdict: verdict({
        scores: { metalBelievability: 3 },
        adjust: { worldStrengthDelta: 0.02 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(0.02);
    expect(result.guardrailHits).toEqual([]);
  });
});

describe("G7 pass-type knob gate — stone (transparent) passes", () => {
  it("stone pass + contactShadowDelta!=0 -> zeroed + pass_gate:contactShadow hit", () => {
    const result = decideLoop({
      verdict: verdict({
        adjust: { contactShadowDelta: 0.08, worldStrengthDelta: -0.02 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "stone",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.contactShadowDelta).toBe(0);
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(-0.02);
    expect(result.guardrailHits).toContain("pass_gate:contactShadow");
  });

  it("metal pass keeps the contactShadowDelta (gate is stone-only)", () => {
    const result = decideLoop({
      verdict: verdict({
        adjust: { contactShadowDelta: 0.08 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas?.contactShadowDelta).toBe(0.08);
    expect(result.guardrailHits).toEqual([]);
  });
});

describe("guardrails zeroing EVERY delta -> freeze-best, never a no-op re-render", () => {
  it("stone pass where the only proposed move is a forbidden+gated set -> freeze-best with hits kept", () => {
    const result = decideLoop({
      verdict: verdict({
        flags: { milky: true },
        adjust: { exposureDelta: 0.6, contactShadowDelta: 0.05 },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "stone",
    });
    expect(result.decision).toBe("freeze-best");
    expect(result.appliedDeltas).toBeUndefined();
    expect(result.guardrailHits).toContain("forbidden_move:exposure");
    expect(result.guardrailHits).toContain("pass_gate:contactShadow");
  });
});

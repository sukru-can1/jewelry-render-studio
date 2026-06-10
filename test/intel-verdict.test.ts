// INTEL-03 (09-01 Task 3) — visionVerdictSchema: the structured-output contract
// the vision model fills (09-AI-SPEC §5.2). G1: a malformed/hallucinated structure
// can never drive a render — parse rejects it. G2 layer 1: every adjust delta
// carries hard .min()/.max() bounds at the schema level.
import { describe, expect, it } from "vitest";

import { visionVerdictSchema, type VisionVerdict } from "@/lib/intelligence/verdict";

export function makeVerdict(patch: Partial<Record<string, unknown>> = {}): unknown {
  return {
    scores: {
      diamondBrilliance: 4,
      metalHighlight: 4,
      metalBelievability: 4,
      exposureTonal: 4,
      stoneSymmetry: 3,
      contactShadow: 3,
      framing: 4,
      backgroundHoldout: 4,
    },
    flags: {
      milky: false,
      wrongMetal: false,
      brokenHoldout: false,
      blownHighlights: false,
      emptyOrBroken: false,
    },
    adjust: {
      worldStrengthDelta: 0,
      exposureDelta: 0,
      cardDarknessDelta: 0,
      contactShadowDelta: 0,
    },
    cameraPresetSuggestion: null,
    overallScore: 4,
    rationale: "Crisp facets, believable white gold, clean sweep.",
    ...patch,
  };
}

describe("visionVerdictSchema — accepts well-formed verdicts", () => {
  it("parses the full 8-dim + 5-flag + 4-delta shape and round-trips", () => {
    const parsed: VisionVerdict = visionVerdictSchema.parse(makeVerdict());
    expect(parsed.scores.diamondBrilliance).toBe(4);
    expect(parsed.flags.milky).toBe(false);
    expect(parsed.adjust.exposureDelta).toBe(0);
    expect(parsed.cameraPresetSuggestion).toBeNull();
    expect(parsed.overallScore).toBe(4);
    // re-.parse()-able (defensive re-parse mirrors ai-classify.ts)
    expect(visionVerdictSchema.parse(parsed)).toEqual(parsed);
  });

  it("accepts boundary deltas exactly at the bounds and a camera preset suggestion", () => {
    const parsed = visionVerdictSchema.parse(
      makeVerdict({
        adjust: {
          worldStrengthDelta: -0.05,
          exposureDelta: 1,
          cardDarknessDelta: 0.4,
          contactShadowDelta: -0.1,
        },
        cameraPresetSuggestion: "front",
      }),
    );
    expect(parsed.adjust.worldStrengthDelta).toBe(-0.05);
    expect(parsed.cameraPresetSuggestion).toBe("front");
  });
});

describe("visionVerdictSchema — rejects out-of-contract verdicts (G1/G2)", () => {
  it("rejects an out-of-range delta (exposureDelta: 2)", () => {
    const bad = makeVerdict({
      adjust: {
        worldStrengthDelta: 0,
        exposureDelta: 2, // > +1 bound
        cardDarknessDelta: 0,
        contactShadowDelta: 0,
      },
    });
    expect(() => visionVerdictSchema.parse(bad)).toThrow();
  });

  it("rejects an oversized worldStrengthDelta (the hallucinated +999)", () => {
    const bad = makeVerdict({
      adjust: {
        worldStrengthDelta: 999,
        exposureDelta: 0,
        cardDarknessDelta: 0,
        contactShadowDelta: 0,
      },
    });
    expect(() => visionVerdictSchema.parse(bad)).toThrow();
  });

  it("rejects a non-integer score (4.5)", () => {
    const bad = makeVerdict();
    (bad as Record<string, any>).scores.diamondBrilliance = 4.5;
    expect(() => visionVerdictSchema.parse(bad)).toThrow();
  });

  it("rejects scores outside 1..5", () => {
    const zero = makeVerdict();
    (zero as Record<string, any>).overallScore = 0;
    expect(() => visionVerdictSchema.parse(zero)).toThrow();
    const six = makeVerdict();
    (six as Record<string, any>).overallScore = 6;
    expect(() => visionVerdictSchema.parse(six)).toThrow();
  });

  it("requires the flags block (hard-gate booleans are not optional)", () => {
    const bad = makeVerdict();
    delete (bad as Record<string, unknown>).flags;
    expect(() => visionVerdictSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown cameraPresetSuggestion", () => {
    expect(() =>
      visionVerdictSchema.parse(makeVerdict({ cameraPresetSuggestion: "macro" })),
    ).toThrow();
  });

  it("rejects a rationale over 600 chars (audit-trail bound)", () => {
    expect(() =>
      visionVerdictSchema.parse(makeVerdict({ rationale: "x".repeat(601) })),
    ).toThrow();
  });
});

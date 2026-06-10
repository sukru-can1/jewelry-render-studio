// INTEL-03 (09-01 Task 3) — decideLoop decision priority: escalate -> accept ->
// autoCorrect -> freeze-best (09-AI-SPEC §5.5, verbatim predicates), with the G3
// iteration cap and G4 stop-on-no-improvement encoded as guardrail hits.
import { describe, expect, it } from "vitest";

import { decideLoop, GOOD_ENOUGH, MAX_ITERATIONS } from "@/lib/intelligence/loop";
import { visionVerdictSchema, type VisionVerdict } from "@/lib/intelligence/verdict";

type DeepPatch = {
  scores?: Partial<VisionVerdict["scores"]>;
  flags?: Partial<VisionVerdict["flags"]>;
  adjust?: Partial<VisionVerdict["adjust"]>;
  cameraPresetSuggestion?: VisionVerdict["cameraPresetSuggestion"];
  overallScore?: number;
  rationale?: string;
};

function verdict(patch: DeepPatch = {}): VisionVerdict {
  return visionVerdictSchema.parse({
    scores: {
      diamondBrilliance: 4,
      metalHighlight: 4,
      metalBelievability: 4,
      exposureTonal: 4,
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
    cameraPresetSuggestion: patch.cameraPresetSuggestion ?? null,
    overallScore: patch.overallScore ?? 4,
    rationale: patch.rationale ?? "test verdict",
  });
}

describe("loop constants (09-AI-SPEC §5.5)", () => {
  it("GOOD_ENOUGH=4, MAX_ITERATIONS=2", () => {
    expect(GOOD_ENOUGH).toBe(4);
    expect(MAX_ITERATIONS).toBe(2);
  });
});

describe("decideLoop — accept", () => {
  it("clean high verdict -> accept (D1>=4, D3>=4, D2>=3, D8>=3, no 1s, overall>=4)", () => {
    const result = decideLoop({
      verdict: verdict({ overallScore: 5 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("accept");
    expect(result.guardrailHits).toEqual([]);
  });

  it("a hard 1 in ANY dimension blocks accept even with overall>=4", () => {
    const result = decideLoop({
      verdict: verdict({ scores: { framing: 1 }, overallScore: 4 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).not.toBe("accept");
  });

  it("D1 below 4 blocks accept (diamond brilliance hard gate)", () => {
    const result = decideLoop({
      verdict: verdict({ scores: { diamondBrilliance: 3 }, overallScore: 4 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).not.toBe("accept");
  });
});

describe("decideLoop — escalate (priority 1, never loop)", () => {
  it("brokenHoldout=true -> escalate even with accept-worthy scores (G6)", () => {
    const result = decideLoop({
      verdict: verdict({ flags: { brokenHoldout: true }, overallScore: 5 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("escalate");
    expect(result.appliedDeltas).toBeUndefined();
  });

  it("emptyOrBroken=true -> escalate, no deltas applied (G6)", () => {
    const result = decideLoop({
      verdict: verdict({
        flags: { emptyOrBroken: true },
        adjust: { exposureDelta: -0.5 },
        overallScore: 1,
        scores: {
          diamondBrilliance: 1,
          metalHighlight: 1,
          metalBelievability: 1,
          exposureTonal: 1,
          stoneSymmetry: 1,
          contactShadow: 1,
          framing: 1,
          backgroundHoldout: 1,
        },
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("escalate");
    expect(result.appliedDeltas).toBeUndefined();
  });

  it("iteration >= MAX_ITERATIONS without accept -> escalate with max_iterations hit (G3)", () => {
    const result = decideLoop({
      verdict: verdict({
        scores: { diamondBrilliance: 3 },
        adjust: { worldStrengthDelta: -0.02 },
        overallScore: 3,
      }),
      iteration: MAX_ITERATIONS,
      prevBestScore: 2,
      pass: "metal",
    });
    expect(result.decision).toBe("escalate");
    expect(result.guardrailHits).toContain("max_iterations");
  });

  it("iteration >= MAX_ITERATIONS but accept-worthy -> accept (cap only fires below the bar)", () => {
    const result = decideLoop({
      verdict: verdict({ overallScore: 5 }),
      iteration: MAX_ITERATIONS,
      prevBestScore: 4,
      pass: "metal",
    });
    expect(result.decision).toBe("accept");
  });
});

describe("decideLoop — autoCorrect (priority 3)", () => {
  it("a 2-3 verdict with a real delta at iteration 0, improving -> autoCorrect", () => {
    const result = decideLoop({
      verdict: verdict({
        scores: { diamondBrilliance: 2, exposureTonal: 3 },
        adjust: { worldStrengthDelta: -0.03, cardDarknessDelta: -0.2 },
        overallScore: 3,
      }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.appliedDeltas).toBeDefined();
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(-0.03);
    expect(result.appliedDeltas?.cardDarknessDelta).toBe(-0.2);
  });

  it("no non-zero delta -> never autoCorrect (falls through to freeze-best)", () => {
    const result = decideLoop({
      verdict: verdict({ scores: { diamondBrilliance: 3 }, overallScore: 3 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("freeze-best");
  });
});

describe("decideLoop — freeze-best (G4 stop-on-no-improvement)", () => {
  it("a non-improving rescore (overallScore <= prevBest) -> freeze-best with no_improvement hit", () => {
    const result = decideLoop({
      verdict: verdict({
        scores: { diamondBrilliance: 3 },
        adjust: { worldStrengthDelta: -0.02 },
        overallScore: 3,
      }),
      iteration: 1,
      prevBestScore: 3, // delta <= 0 vs previous best
      pass: "metal",
    });
    expect(result.decision).toBe("freeze-best");
    expect(result.guardrailHits).toContain("no_improvement");
    expect(result.appliedDeltas).toBeUndefined();
  });

  it("a regression (overallScore < prevBest) also freezes best, never ships the regressed set", () => {
    const result = decideLoop({
      verdict: verdict({
        scores: { diamondBrilliance: 2 },
        adjust: { exposureDelta: -0.3 },
        overallScore: 2,
      }),
      iteration: 1,
      prevBestScore: 3,
      pass: "metal",
    });
    expect(result.decision).toBe("freeze-best");
    expect(result.guardrailHits).toContain("no_improvement");
  });
});

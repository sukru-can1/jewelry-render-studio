// INTEL-06 (Phase 9, 09-04) — the calibration gate math + the autoCorrectTrusted
// recommend-only gate. ALL PURE: zero AI calls, zero blob/prisma/sharp — verdicts
// are hand-built fixtures (09-VALIDATION: "the pure libs need no mocks").
//
// Asserts:
//  - withinOne ±1 boundary (Δ=1 passes, Δ=2 fails);
//  - signAgrees catches the milky anti-pattern (+exposure proposed when the
//    operator label says the move must be NEGATIVE — T-09-15);
//  - agreementScore returns the exact passing-check fraction over a synthetic set;
//  - autoCorrectTrusted(0.7) true / (0.69) false — the INTEL-06 ≥0.7 trust gate;
//  - computeCalibration aggregates per-dimension within-±1 rates, hard-gate hit
//    rate (with failures listed — the safety regression detector), delta
//    sign-agreement rate and the overall judge↔human agreement;
//  - decideLoop gates auto re-dispatch behind `trusted`: omitted/false ->
//    recommendOnly:true on an autoCorrect verdict (recommend-only DEFAULT);
//    trusted:true -> recommendOnly:false; accept/escalate are unaffected.
import { describe, expect, it } from "vitest";

import {
  AGREEMENT_THRESHOLD,
  agreementScore,
  autoCorrectTrusted,
  computeCalibration,
  evaluateCase,
  signAgrees,
  signOf,
  withinOne,
  type CalibrationCase,
} from "@/lib/intelligence/calibration";
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
      diamondBrilliance: 4,
      metalHighlight: 4,
      metalBelievability: 4,
      exposureTonal: 4,
      stoneSymmetry: 4,
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
    overallScore: patch.overallScore ?? 4,
    rationale: "calibration fixture",
  });
}

const GOOD_SCORES: CalibrationCase["humanScores"] = {
  diamondBrilliance: 4,
  metalHighlight: 4,
  metalBelievability: 4,
  exposureTonal: 4,
  stoneSymmetry: 4,
  contactShadow: 3,
  framing: 4,
  backgroundHoldout: 4,
};

describe("withinOne — the ±1 per-dimension tolerance (09-AI-SPEC §5.7)", () => {
  it("Δ=0 and Δ=1 pass in both directions", () => {
    expect(withinOne(4, 4)).toBe(true);
    expect(withinOne(3, 4)).toBe(true);
    expect(withinOne(5, 4)).toBe(true);
  });

  it("Δ=2 fails in both directions", () => {
    expect(withinOne(2, 4)).toBe(false);
    expect(withinOne(5, 3)).toBe(false);
  });
});

describe("signAgrees — delta sign-agreement (the milky anti-pattern catcher)", () => {
  it("a negative proposed delta agrees with an expected -1", () => {
    expect(signAgrees(-0.03, -1)).toBe(true);
  });

  it("a POSITIVE proposed delta DISAGREES with an expected -1 (raise-brightness-to-fix-milky, T-09-15)", () => {
    expect(signAgrees(0.02, -1)).toBe(false);
  });

  it("expectedSign 0 means 'expect ~no move': zero/epsilon agree, a real move disagrees", () => {
    expect(signAgrees(0, 0)).toBe(true);
    expect(signAgrees(1e-12, 0)).toBe(true); // |value| < epsilon reads as sign 0
    expect(signAgrees(0.02, 0)).toBe(false);
    expect(signAgrees(-0.02, 0)).toBe(false);
  });

  it("signOf treats |value| below epsilon as 0", () => {
    expect(signOf(0)).toBe(0);
    expect(signOf(1e-12)).toBe(0);
    expect(signOf(0.01)).toBe(1);
    expect(signOf(-0.01)).toBe(-1);
  });
});

describe("autoCorrectTrusted — the ≥0.7 trust gate (INTEL-06)", () => {
  it("0.7 is trusted, 0.69 is NOT (boundary inclusive at the threshold)", () => {
    expect(autoCorrectTrusted(0.7)).toBe(true);
    expect(autoCorrectTrusted(0.69)).toBe(false);
  });

  it("the default threshold constant is 0.7 and a custom threshold is honored", () => {
    expect(AGREEMENT_THRESHOLD).toBe(0.7);
    expect(autoCorrectTrusted(0.8, 0.9)).toBe(false);
    expect(autoCorrectTrusted(0.95, 0.9)).toBe(true);
  });
});

describe("evaluateCase + agreementScore — the per-check fraction", () => {
  const acceptCase: CalibrationCase = {
    id: "good-1",
    expectVerdict: "accept",
    humanScores: GOOD_SCORES,
    expectGates: { milky: false, brokenHoldout: false },
  };

  const milkyCase: CalibrationCase = {
    id: "bad-milky",
    expectVerdict: "autoCorrect",
    humanScores: { ...GOOD_SCORES, diamondBrilliance: 1, exposureTonal: 2 },
    expectGates: { milky: true },
    expectDeltaSign: { worldStrength: -1, exposure: 0 },
  };

  it("a perfectly agreeing pair passes every check (agreement 1)", () => {
    const result = evaluateCase(acceptCase, verdict());
    expect(result.total).toBeGreaterThan(0);
    expect(result.passed).toBe(result.total);
    expect(result.hardGateFailure).toBe(false);
    expect(agreementScore([result])).toBe(1);
  });

  it("delta signs are checked ONLY on non-accept cases", () => {
    // An accept case never contributes sign checks even if expectDeltaSign present.
    const withSigns: CalibrationCase = {
      ...acceptCase,
      expectDeltaSign: { exposure: 0 },
    };
    const result = evaluateCase(withSigns, verdict({ adjust: { exposureDelta: 0.5 } }));
    expect(result.checks.filter((c) => c.kind === "deltaSign")).toHaveLength(0);
  });

  it("the milky anti-pattern fails the sign check: judge proposes +world to 'fix' milky", () => {
    const judged = verdict({
      scores: { diamondBrilliance: 1, exposureTonal: 2 },
      flags: { milky: true },
      adjust: { worldStrengthDelta: 0.03 }, // WRONG direction — label says -1
      overallScore: 2,
    });
    const result = evaluateCase(milkyCase, judged);
    const sign = result.checks.find(
      (c) => c.kind === "deltaSign" && c.key === "worldStrength",
    );
    expect(sign?.pass).toBe(false);
  });

  it("an expected-true gate that does NOT fire is a hardGateFailure (safety regression)", () => {
    const judged = verdict({
      scores: { diamondBrilliance: 1, exposureTonal: 2 },
      flags: { milky: false }, // gate expected true, did not fire
      adjust: { worldStrengthDelta: -0.03 },
      overallScore: 2,
    });
    const result = evaluateCase(milkyCase, judged);
    expect(result.hardGateFailure).toBe(true);
    expect(result.passed).toBeLessThan(result.total);
  });

  it("agreementScore returns the exact passing fraction over a synthetic set", () => {
    // Case A: all checks pass. Case B: 8 dims pass, gate passes, 1 of 2 signs fails.
    const a = evaluateCase(acceptCase, verdict());
    const b = evaluateCase(
      milkyCase,
      verdict({
        scores: { diamondBrilliance: 1, exposureTonal: 2 },
        flags: { milky: true },
        adjust: { worldStrengthDelta: 0.03, exposureDelta: 0 }, // world sign WRONG
        overallScore: 2,
      }),
    );
    const total = a.total + b.total;
    const passed = a.passed + b.passed;
    expect(b.passed).toBe(b.total - 1); // exactly the one wrong sign
    expect(agreementScore([a, b])).toBeCloseTo(passed / total, 12);
  });

  it("agreementScore of an empty set is 0 (never trusted on no evidence)", () => {
    expect(agreementScore([])).toBe(0);
  });
});

describe("computeCalibration — the aggregated report (per-dim / gates / signs / agreement)", () => {
  const goodCase: CalibrationCase = {
    id: "good-1",
    expectVerdict: "accept",
    humanScores: GOOD_SCORES,
    expectGates: { brokenHoldout: false },
  };
  const badCase: CalibrationCase = {
    id: "bad-holdout",
    expectVerdict: "escalate",
    humanScores: { ...GOOD_SCORES, framing: 1, backgroundHoldout: 1 },
    expectGates: { brokenHoldout: true },
    expectDeltaSign: { worldStrength: 0, exposure: 0, cardDarkness: 0, contactShadow: 0 },
  };

  it("a fully agreeing set reports agreement 1, trusted true, zero hard-gate failures", () => {
    const report = computeCalibration([
      { labelled: goodCase, verdict: verdict() },
      {
        labelled: badCase,
        verdict: verdict({
          scores: { framing: 1, backgroundHoldout: 1 },
          flags: { brokenHoldout: true },
          overallScore: 1,
        }),
      },
    ]);
    expect(report.scoredCases).toBe(2);
    expect(report.agreement).toBe(1);
    expect(report.trusted).toBe(true);
    expect(report.hardGates.failures).toEqual([]);
    expect(report.hardGates.expected).toBe(1);
    expect(report.hardGates.fired).toBe(1);
    expect(report.perDimension.diamondBrilliance.rate).toBe(1);
    expect(report.deltaSigns.checked).toBe(4);
    expect(report.deltaSigns.agreed).toBe(4);
  });

  it("a missed hard gate on the bad set lands in hardGates.failures with the case id", () => {
    const report = computeCalibration([
      {
        labelled: badCase,
        verdict: verdict({
          scores: { framing: 1, backgroundHoldout: 2 },
          flags: { brokenHoldout: false }, // safety regression
          overallScore: 2,
        }),
      },
    ]);
    expect(report.hardGates.failures).toEqual([
      { caseId: "bad-holdout", gate: "brokenHoldout" },
    ]);
    expect(report.trusted).toBe(report.agreement >= 0.7);
  });

  it("per-dimension rates isolate the failing dimension", () => {
    const report = computeCalibration([
      {
        labelled: goodCase,
        verdict: verdict({ scores: { diamondBrilliance: 2 } }), // Δ=2 vs human 4
      },
    ]);
    expect(report.perDimension.diamondBrilliance.within).toBe(0);
    expect(report.perDimension.diamondBrilliance.rate).toBe(0);
    expect(report.perDimension.metalHighlight.rate).toBe(1);
  });

  it("an empty scored set reports agreement 0 and trusted false (recommend-only)", () => {
    const report = computeCalibration([]);
    expect(report.scoredCases).toBe(0);
    expect(report.agreement).toBe(0);
    expect(report.trusted).toBe(false);
  });
});

describe("decideLoop — the autoCorrectTrusted recommend-only gate (INTEL-06)", () => {
  const correctable = () =>
    verdict({
      scores: { diamondBrilliance: 2, exposureTonal: 3 },
      adjust: { worldStrengthDelta: -0.03, cardDarknessDelta: -0.2 },
      overallScore: 3,
    });

  it("trusted OMITTED (the safe default) -> autoCorrect decision is recommendOnly:true", () => {
    const result = decideLoop({
      verdict: correctable(),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.recommendOnly).toBe(true);
    // The sanitized deltas are still surfaced — they are the RECOMMENDATION.
    expect(result.appliedDeltas?.worldStrengthDelta).toBe(-0.03);
  });

  it("trusted:false -> recommendOnly:true (operator applies/declines; no auto re-preview)", () => {
    const result = decideLoop({
      verdict: correctable(),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
      trusted: false,
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.recommendOnly).toBe(true);
  });

  it("trusted:true -> recommendOnly:false (auto re-preview as before)", () => {
    const result = decideLoop({
      verdict: correctable(),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
      trusted: true,
    });
    expect(result.decision).toBe("autoCorrect");
    expect(result.recommendOnly).toBe(false);
  });

  it("accept and escalate are UNAFFECTED by the trust gate", () => {
    const accepted = decideLoop({
      verdict: verdict({ overallScore: 5 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
      trusted: false,
    });
    expect(accepted.decision).toBe("accept");
    expect(accepted.recommendOnly).toBeUndefined();

    const escalated = decideLoop({
      verdict: verdict({ flags: { brokenHoldout: true }, overallScore: 2 }),
      iteration: 0,
      prevBestScore: 0,
      pass: "metal",
      trusted: false,
    });
    expect(escalated.decision).toBe("escalate");
    expect(escalated.recommendOnly).toBeUndefined();
  });
});

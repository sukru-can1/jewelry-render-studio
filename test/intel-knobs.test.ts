// INTEL-01 (09-01 Task 2) — KNOB_RANGES / clamp / applyDeltas: the G2 belt-and-
// suspenders layer. Every value the adaptive loop can emit passes through clamp()
// against the SAFE per-knob ranges (09-AI-SPEC §5.2) BEFORE it ever reaches
// buildEnterpriseRecipe — a hallucinated out-of-range knob can never reach Blender.
//
// Pure module, zero mocks: knobs.ts imports no prisma/react/sharp/ai.
import { describe, expect, it } from "vitest";

import {
  applyDeltas,
  clamp,
  KNOB_DEFAULTS,
  KNOB_RANGES,
  type ProfileOverrides,
} from "@/lib/intelligence/knobs";

/** Minimal verdict-shaped input for applyDeltas (structural — matches VisionVerdict). */
function verdictWith(
  adjust: Partial<{
    worldStrengthDelta: number;
    exposureDelta: number;
    cardDarknessDelta: number;
    contactShadowDelta: number;
  }> = {},
  cameraPresetSuggestion: "hero" | "front" | "top" | "profile" | null = null,
) {
  return {
    adjust: {
      worldStrengthDelta: 0,
      exposureDelta: 0,
      cardDarknessDelta: 0,
      contactShadowDelta: 0,
      ...adjust,
    },
    cameraPresetSuggestion,
  };
}

describe("KNOB_RANGES (09-AI-SPEC §5.2, authoritative)", () => {
  it("carries the exact safe ranges from the spec", () => {
    expect(KNOB_RANGES.worldStrength).toEqual([0.04, 0.2]);
    expect(KNOB_RANGES.exposure).toEqual([-1.5, 0.3]);
    expect(KNOB_RANGES.cardDarkness).toEqual([0.0, 0.5]);
    expect(KNOB_RANGES.contactShadowStrength).toEqual([0.04, 0.22]);
  });

  it("KNOB_DEFAULTS mirror the recipe assembly values (identity baselines)", () => {
    expect(KNOB_DEFAULTS.worldStrength).toBe(0.105);
    expect(KNOB_DEFAULTS.exposure).toBe(-0.58);
    expect(KNOB_DEFAULTS.contactShadowStrength).toBe(0.115);
    // cardDarkness identity = 1.0 (direct multiplier on today's card colors).
    expect(KNOB_DEFAULTS.cardDarkness).toBe(1.0);
  });
});

describe("clamp()", () => {
  it("saturates at the lower bound", () => {
    expect(clamp(0.01, KNOB_RANGES.worldStrength)).toBe(0.04);
    expect(clamp(-99, KNOB_RANGES.exposure)).toBe(-1.5);
    expect(clamp(-1, KNOB_RANGES.cardDarkness)).toBe(0.0);
    expect(clamp(0, KNOB_RANGES.contactShadowStrength)).toBe(0.04);
  });

  it("saturates at the upper bound", () => {
    expect(clamp(999, KNOB_RANGES.worldStrength)).toBe(0.2);
    expect(clamp(5, KNOB_RANGES.exposure)).toBe(0.3);
    expect(clamp(2, KNOB_RANGES.cardDarkness)).toBe(0.5);
    expect(clamp(0.5, KNOB_RANGES.contactShadowStrength)).toBe(0.22);
  });

  it("passes through in-range values unchanged", () => {
    expect(clamp(0.105, KNOB_RANGES.worldStrength)).toBe(0.105);
    expect(clamp(-0.58, KNOB_RANGES.exposure)).toBe(-0.58);
    expect(clamp(0.115, KNOB_RANGES.contactShadowStrength)).toBe(0.115);
  });
});

describe("applyDeltas() — current + signed delta -> clamp -> overrides (G2)", () => {
  it("milky correction: worldStrengthDelta -0.05 from the 0.105 default -> 0.055 (in range)", () => {
    const out = applyDeltas({}, verdictWith({ worldStrengthDelta: -0.05 }));
    expect(out.worldStrength).toBeCloseTo(0.055, 10);
    // untouched knobs are NOT emitted (minimal override object)
    expect(out).not.toHaveProperty("exposure");
    expect(out).not.toHaveProperty("cardDarkness");
    expect(out).not.toHaveProperty("contactShadowStrength");
    expect(out).not.toHaveProperty("cameraPreset");
  });

  it("uses the CURRENT override value (not the default) when one is set", () => {
    const current: ProfileOverrides = { worldStrength: 0.06 };
    const out = applyDeltas(current, verdictWith({ worldStrengthDelta: -0.05 }));
    // 0.06 - 0.05 = 0.01 -> clamped up to the 0.04 floor
    expect(out.worldStrength).toBe(0.04);
  });

  it("clamp caps a hallucinated oversized result at the top bound", () => {
    // Schema bounds make +999 impossible, but clamp is the belt-and-suspenders layer:
    const out = applyDeltas(
      { worldStrength: 0.19 },
      verdictWith({ worldStrengthDelta: 999 }),
    );
    expect(out.worldStrength).toBe(0.2);
  });

  it("clamps the exposure walk at the dark floor", () => {
    const out = applyDeltas({ exposure: -1.0 }, verdictWith({ exposureDelta: -1 }));
    expect(out.exposure).toBe(-1.5);
  });

  it("cameraPreset: suggestion wins; falls back to current; omitted when neither", () => {
    expect(applyDeltas({}, verdictWith({}, "front")).cameraPreset).toBe("front");
    expect(
      applyDeltas({ cameraPreset: "top" }, verdictWith({}, null)).cameraPreset,
    ).toBe("top");
    expect(applyDeltas({}, verdictWith({}, null))).not.toHaveProperty("cameraPreset");
  });

  it("all-zero deltas + empty current -> empty override object", () => {
    expect(applyDeltas({}, verdictWith())).toEqual({});
  });

  it("a zero delta carries forward an already-set knob (was-set is preserved)", () => {
    const out = applyDeltas({ exposure: -1.2 }, verdictWith({ worldStrengthDelta: 0.01 }));
    expect(out.exposure).toBe(-1.2);
    expect(out.worldStrength).toBeCloseTo(0.115, 10);
  });
});

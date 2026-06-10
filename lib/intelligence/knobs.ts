// INTEL-01 (Phase 9) — the named-knob override contract + the G2 clamp layer.
//
// PURE module: no prisma, no react, no sharp, no ai imports. This is the ONLY
// shape the adaptive loop is allowed to emit toward the recipe generator (G10 —
// single-quality-source rule): a small object of named knobs, never recipe JSON.
// Every numeric value is clamped to KNOB_RANGES before buildEnterpriseRecipe
// ever sees it — a hallucinated out-of-range value can never reach Blender.
//
// Contract source: 09-AI-RESEARCH §6 (authoritative shape) + 09-AI-SPEC §5.2
// (authoritative ranges). `cardPosition` is deliberately DEFERRED (research §6).

/** The existing generator camera angles a verdict may select (no numeric clamp). */
export type CameraPresetKey = "hero" | "front" | "top" | "profile";

/**
 * The minimal named-knob override set `buildEnterpriseRecipe` accepts.
 * An undefined knob leaves the recipe default untouched (purely additive).
 */
export type ProfileOverrides = {
  /** world.strength — recipe default 0.105. Lower fixes milky/over-bright. */
  worldStrength?: number;
  /** render.exposure — recipe default -0.58. More negative protects highlights. */
  exposure?: number;
  /**
   * Multiplier on every reflection_cards[].color RGB (alpha untouched).
   * IDENTITY BASELINE = 1.0 (today's card colors, KNOB_DEFAULTS.cardDarkness).
   * LOWER = darker cards = readable facets (the DOMAIN-sanctioned correction
   * direction); the SAFE override range [0, 0.5] means any explicit override
   * darkens cards to at most half of today's brightness. 0 = pure black.
   */
  cardDarkness?: number;
  /** contact_shadows[].alpha — recipe default 0.115. */
  contactShadowStrength?: number;
  /** Selects ANGLES[cameraPreset] INSTEAD of request.angle (symptom 6/9). */
  cameraPreset?: CameraPresetKey;
};

/** The four numeric knob keys (cameraPreset is an enum, not clamped). */
export type NumericKnob = Exclude<keyof ProfileOverrides, "cameraPreset">;

/**
 * SAFE per-knob ranges — clamp BEFORE the recipe ever sees a value (G2).
 * 09-AI-SPEC §5.2, verbatim.
 */
export const KNOB_RANGES: Record<NumericKnob, readonly [number, number]> = {
  worldStrength: [0.04, 0.2],
  exposure: [-1.5, 0.3],
  cardDarkness: [0.0, 0.5],
  contactShadowStrength: [0.04, 0.22],
} as const;

/**
 * The identity baselines — the values the UNMODIFIED recipe assembly uses.
 * lib/enterprise-recipes.ts imports these (single source of truth, no duplicated
 * magic numbers), so "default knob value" here is PROVABLY today's recipe value.
 *
 * NOTE cardDarkness: the identity multiplier is 1.0 (today's colors verbatim) and
 * sits intentionally OUTSIDE the [0, 0.5] override range — identity is reached by
 * ABSENCE of the knob, while any explicit override is forced into the safe
 * darker-than-today band.
 */
export const KNOB_DEFAULTS: Record<NumericKnob, number> = {
  worldStrength: 0.105,
  exposure: -0.58,
  cardDarkness: 1.0,
  contactShadowStrength: 0.115,
} as const;

/** Saturating clamp of `n` into `[lo, hi]`. */
export function clamp(n: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The verdict surface applyDeltas consumes. Structural (not imported from
 * verdict.ts) so this module stays dependency-free; the zod-validated
 * VisionVerdict is assignable to it.
 */
export type VerdictAdjustments = {
  adjust: {
    worldStrengthDelta: number;
    exposureDelta: number;
    cardDarknessDelta: number;
    contactShadowDelta: number;
  };
  cameraPresetSuggestion: CameraPresetKey | null;
};

const DELTA_KEY_BY_KNOB: Record<NumericKnob, keyof VerdictAdjustments["adjust"]> = {
  worldStrength: "worldStrengthDelta",
  exposure: "exposureDelta",
  cardDarkness: "cardDarknessDelta",
  contactShadowStrength: "contactShadowDelta",
};

/**
 * Turn the verdict's signed RELATIVE deltas into absolute, CLAMPED overrides:
 * new = clamp((current[knob] ?? KNOB_DEFAULTS[knob]) + delta, KNOB_RANGES[knob]).
 *
 * Emission is minimal: a knob key appears in the result only when it changed
 * (non-zero delta) or was already set on `current` (a prior correction is carried
 * forward, re-clamped). cameraPreset = suggestion ?? current, omitted when neither.
 */
export function applyDeltas(
  current: ProfileOverrides,
  verdict: VerdictAdjustments,
): ProfileOverrides {
  const out: ProfileOverrides = {};

  for (const knob of Object.keys(DELTA_KEY_BY_KNOB) as NumericKnob[]) {
    const delta = verdict.adjust[DELTA_KEY_BY_KNOB[knob]];
    const currentValue = current[knob];
    if (delta === 0 && currentValue === undefined) continue; // untouched
    out[knob] = clamp((currentValue ?? KNOB_DEFAULTS[knob]) + delta, KNOB_RANGES[knob]);
  }

  const cameraPreset = verdict.cameraPresetSuggestion ?? current.cameraPreset;
  if (cameraPreset !== undefined) out.cameraPreset = cameraPreset;

  return out;
}

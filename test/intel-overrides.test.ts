// INTEL-01 (09-01 Task 2) — buildEnterpriseRecipe profileOverrides extension.
//
// HARD requirement: with NO profileOverrides the output is BYTE-IDENTICAL to the
// pre-change generator. The FULL golden below was captured from the UNMODIFIED
// lib/enterprise-recipes.ts (commit 81cb108) over JSON.stringify — any drift in
// field values OR key order fails this test.
//
// The STONE golden was DELIBERATELY regenerated for the layered-pass visibility
// contract (OUT-01 fix): stone passes now emit model.pass_holdout_contains and
// no longer put pass tokens into include_contains/exclude_contains, so the
// normalization basis stays the FULL product and layers align for compositing.
// The full-pass golden is intentionally UNCHANGED — full passes emit neither
// new field.
//
// WITH profileOverrides: each named knob moves exactly one recipe surface, CLAMPED
// to KNOB_RANGES (G2), and nothing else changes. cameraPreset selects the ANGLES
// entry INSTEAD of request.angle (symptom 6/9 — e.g. the lower front camera).
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildEnterpriseRecipe,
  enterpriseAngles,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";

const GOLDEN_FULL_SHA256 =
  "bbc2acb4daf4a65a17f5e21bd2605142cfefadb80fd14ccc4143f53377354166";
const GOLDEN_STONE_SHA256 =
  "37e7a5215ce1c3e2804c632d4a3a5927afed5850b42a7df702230be780ca40d5";

const reqFull: EnterpriseRecipeRequest = {
  angle: "hero",
  groupTokens: {
    alloycolour: ["band_metal gold"],
    diamond: ["center_diamond glass"],
    stone2: [],
    stone3: [],
  },
  metal: "white",
  pass: "full",
  productName: "Ring 99",
  resolution: 1024,
  samples: 128,
  stoneMaterials: { diamond: "diamond", stone2: "sapphire", stone3: "diamond" },
};

const reqStone: EnterpriseRecipeRequest = {
  ...reqFull,
  angle: "front",
  metal: "rose",
  pass: "stone",
  stoneGroup: "diamond",
};

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Today's reflection-card colors, verbatim from the unmodified generator.
const TODAY_CARD_COLORS = [
  [0.015, 0.015, 0.018, 1],
  [0.38, 0.38, 0.383, 1],
  [0.025, 0.025, 0.028, 1],
  [0.055, 0.055, 0.06, 1],
];

type AnyRecipe = Record<string, any>;

describe("backward compatibility — NO profileOverrides is byte-identical to today", () => {
  it("full/hero/white request matches the pre-change golden sha256", () => {
    expect(sha256(buildEnterpriseRecipe(reqFull))).toBe(GOLDEN_FULL_SHA256);
  });

  it("stone/front/rose request matches the golden sha256 (regenerated for the pass-visibility contract)", () => {
    expect(sha256(buildEnterpriseRecipe(reqStone))).toBe(GOLDEN_STONE_SHA256);
  });

  it("an explicit `profileOverrides: undefined` is byte-identical to the key being absent", () => {
    const withUndefined = buildEnterpriseRecipe({
      ...reqFull,
      profileOverrides: undefined,
    });
    expect(sha256(withUndefined)).toBe(GOLDEN_FULL_SHA256);
  });

  it("today's identity values are in place (the documented knob baselines)", () => {
    const recipe = buildEnterpriseRecipe(reqFull) as AnyRecipe;
    expect(recipe.world.strength).toBe(0.105);
    expect(recipe.render.exposure).toBe(-0.58);
    expect(recipe.contact_shadows[0].alpha).toBe(0.115);
    expect(recipe.reflection_cards.map((c: AnyRecipe) => c.color)).toEqual(
      TODAY_CARD_COLORS,
    );
  });
});

describe("profileOverrides — each knob moves exactly one surface, clamped (G2)", () => {
  const overridden = buildEnterpriseRecipe({
    ...reqFull,
    profileOverrides: {
      worldStrength: 0.06,
      exposure: -1.0,
      contactShadowStrength: 0.18,
      cardDarkness: 0.25, // darker cards = readable facets (lower = darker)
    },
  }) as AnyRecipe;
  const base = buildEnterpriseRecipe(reqFull) as AnyRecipe;

  it("worldStrength -> world.strength", () => {
    expect(overridden.world.strength).toBe(0.06);
  });

  it("exposure -> render.exposure", () => {
    expect(overridden.render.exposure).toBe(-1.0);
  });

  it("contactShadowStrength -> every contact_shadows[].alpha", () => {
    for (const shadow of overridden.contact_shadows) {
      expect(shadow.alpha).toBe(0.18);
    }
  });

  it("cardDarkness scales every reflection_cards[].color RGB toward black, alpha untouched", () => {
    overridden.reflection_cards.forEach((card: AnyRecipe, i: number) => {
      const [r, g, b, a] = TODAY_CARD_COLORS[i];
      expect(card.color[0]).toBeCloseTo(r * 0.25, 12);
      expect(card.color[1]).toBeCloseTo(g * 0.25, 12);
      expect(card.color[2]).toBeCloseTo(b * 0.25, 12);
      expect(card.color[3]).toBe(a);
    });
  });

  it("nothing else changes (camera, lights, materials, model, postprocess, name)", () => {
    expect(overridden.name).toBe(base.name);
    expect(overridden.camera).toEqual(base.camera);
    expect(overridden.lights).toEqual(base.lights);
    expect(overridden.materials).toEqual(base.materials);
    expect(overridden.model).toEqual(base.model);
    expect(overridden.postprocess).toEqual(base.postprocess);
    expect(overridden.background).toEqual(base.background);
    expect(overridden.world.color).toEqual(base.world.color);
    expect(overridden.enterprise).toEqual(base.enterprise);
  });

  it("out-of-range override values are clamped to KNOB_RANGES before reaching the recipe", () => {
    const clamped = buildEnterpriseRecipe({
      ...reqFull,
      profileOverrides: {
        worldStrength: 0.5, // > 0.20 cap
        exposure: -99, // < -1.5 floor
        contactShadowStrength: 0.5, // > 0.22 cap
        cardDarkness: 2, // > 0.5 cap -> scale 0.5
      },
    }) as AnyRecipe;
    expect(clamped.world.strength).toBe(0.2);
    expect(clamped.render.exposure).toBe(-1.5);
    expect(clamped.contact_shadows[0].alpha).toBe(0.22);
    expect(clamped.reflection_cards[1].color[0]).toBeCloseTo(0.38 * 0.5, 12);
  });
});

describe("profileOverrides.cameraPreset — selects the ANGLES entry instead of request.angle", () => {
  it('cameraPreset:"front" uses the front camera bundle even when request.angle==="hero"', () => {
    const recipe = buildEnterpriseRecipe({
      ...reqFull, // angle: "hero"
      profileOverrides: { cameraPreset: "front" },
    }) as AnyRecipe;
    expect(recipe.camera).toEqual(enterpriseAngles.front.camera);
    expect(recipe.model.rotation_degrees).toEqual(enterpriseAngles.front.rotation);
    expect(recipe.model.target_size).toBe(enterpriseAngles.front.targetSize);
    expect(recipe.enterprise.angle_label).toBe(enterpriseAngles.front.label);
    // The combo COORDINATE stays the requested angle (job identity is unchanged):
    expect(recipe.enterprise.angle).toBe("hero");
    expect(recipe.name.endsWith("_hero")).toBe(true);
  });

  it("absent cameraPreset leaves the requested angle in place", () => {
    const recipe = buildEnterpriseRecipe({
      ...reqFull,
      profileOverrides: { exposure: -0.7 },
    }) as AnyRecipe;
    expect(recipe.camera).toEqual(enterpriseAngles.hero.camera);
  });
});

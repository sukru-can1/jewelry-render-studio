// OUT-01 — layered-pass visibility contract (full-product normalization fix).
//
// Passes NO LONGER filter via include_contains/exclude_contains: the worker runs
// filter_product_objects BEFORE transform_model, so pass-level include/exclude made
// auto_center/auto_scale normalize on the pass subset alone (stone passes scaled tiny
// stones up to target_size; each pass got a different transform -> layers could not
// align for compositing). The new contract keeps the FULL product as the normalization
// basis and hides/holds out AFTER transforms via two new optional model fields:
//   - metal pass: pass_hide_contains = ALL stone-group tokens (stones fully hidden).
//   - stone pass: pass_holdout_contains = metal tokens + OTHER stone groups' tokens
//     + DEFENSIVE fallback metal tokens (non-target objects occlude without
//     rendering); render.transparent stays true, studio_background stays off,
//     background.visible_camera is false (floor lights stones, invisible to camera).
//   - full pass: NEITHER field (byte-identical to the classic recipe).
import { describe, expect, it } from "vitest";

import {
  buildEnterpriseRecipe,
  type EnterpriseGroupTokens,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";

const groupTokens: EnterpriseGroupTokens = {
  alloycolour: ["metal", "band", "shank", "prong", "gold"],
  diamond: ["diamond", "center", "round"],
  stone2: ["sapphire"],
  stone3: ["accent"],
};

const STONE_GROUPS = ["diamond", "stone2", "stone3"] as const;

// FALLBACK_TOKENS.alloycolour, verbatim — the defensive metal-token union for
// stone-pass holdouts (live E2E fix: object "Object" / material "WhiteMetal"
// rendered into the stone layer because the SAVED tokens didn't cover it;
// "object whitemetal" contains "metal"). NOTE: deliberately no cut/shape words
// ("round", "center", ...) that could match the target stones themselves.
const FALLBACK_METAL_TOKENS = [
  "metal",
  "band",
  "ring",
  "shank",
  "prong",
  "basket",
  "gold",
  "silver",
  "platinum",
  "alloy",
] as const;

function request(
  overrides: Partial<EnterpriseRecipeRequest>,
): EnterpriseRecipeRequest {
  return {
    angle: "hero",
    metal: "white",
    pass: "stone",
    groupTokens,
    stoneMaterials: { diamond: "diamond", stone2: "sapphire", stone3: "ruby" },
    productName: "ring99",
    resolution: 1920,
    samples: 64,
    ...overrides,
  };
}

function model(recipe: Record<string, unknown>) {
  return recipe.model as Record<string, unknown>;
}

function postprocessStage(
  recipe: Record<string, unknown>,
  stage: string,
): Record<string, unknown> | undefined {
  const pp = recipe.postprocess as Record<string, unknown> | undefined;
  return pp?.[stage] as Record<string, unknown> | undefined;
}

function stageEnabled(recipe: Record<string, unknown>, stage: string): boolean {
  return postprocessStage(recipe, stage)?.enabled === true;
}

function studioBackgroundEnabled(recipe: Record<string, unknown>): boolean {
  return stageEnabled(recipe, "studio_background");
}

// The postprocess stages that can paint SYNTHETIC content into a fixed
// fallback_bounds_norm rectangle when their object tokens miss — on a transparent
// stone layer this drew a giant fake 24-facet disk. They are FULL-pass-only now.
const STONE_OVERLAY_STAGES = [
  "center_stone",
  "center_stone_symmetry",
  "diamond_facets",
] as const;

// NOTE: this unit test inspects only recipe FLAGS — it cannot see rendered pixels.
// The live render after worker deploy is the BINDING check for layer alignment and
// for no holdout metal refracting dark into the stones. Here we only prove the flags.
describe("buildEnterpriseRecipe — layered-pass visibility contract (OUT-01)", () => {
  for (const stoneGroup of STONE_GROUPS) {
    it(`STONE pass (${stoneGroup}): transparent, NO pass-level include/exclude, holdout = metal + other groups, target group untouched`, () => {
      const recipe = buildEnterpriseRecipe(request({ pass: "stone", stoneGroup }));

      const render = recipe.render as Record<string, unknown>;
      expect(render.transparent).toBe(true);

      const m = model(recipe);
      const include = m.include_contains as string[];
      const exclude = m.exclude_contains as string[];
      const holdout = m.pass_holdout_contains as string[];

      // No pass-level filtering: normalization must see the FULL product.
      expect(include).toEqual([]);
      // Junk excludes remain, but metal tokens must NOT leak into exclude anymore.
      expect(exclude).toContain("light");
      for (const token of groupTokens.alloycolour) {
        expect(exclude).not.toContain(token);
      }

      // The stone pass holds out (not hides): metal occludes without rendering.
      expect(m.pass_hide_contains).toBeUndefined();
      expect(holdout.length).toBeGreaterThan(0);
      // holdout = every metal token...
      for (const token of groupTokens.alloycolour) {
        expect(holdout).toContain(token);
      }
      // ...plus every OTHER stone group's tokens...
      for (const group of STONE_GROUPS) {
        if (group === stoneGroup) continue;
        for (const token of groupTokens[group]) {
          expect(holdout).toContain(token);
        }
      }
      // ...plus the DEFENSIVE fallback metal tokens (saved tokens alone missed
      // a band named "Object" with material "WhiteMetal" in the live batch)...
      for (const token of FALLBACK_METAL_TOKENS) {
        expect(holdout).toContain(token);
      }
      // ...and NONE of the target group's tokens (target must stay visible).
      for (const token of groupTokens[stoneGroup]) {
        expect(holdout).not.toContain(token);
      }
      // No broad cut/shape token may sneak in via the fallback union — these
      // could match the target stones' own signatures and hole the layer.
      // ("round" IS allowed when it is an operator-saved OTHER-group token —
      // diamond group here — but must never arrive via the metal fallbacks.)
      if (stoneGroup === "diamond") {
        expect(holdout).not.toContain("round");
        expect(holdout).not.toContain("center");
      }

      expect(studioBackgroundEnabled(recipe)).toBe(false);

      // Live E2E fix: the studio FLOOR plane lit the stones but also rendered
      // as opaque pixels on the holdout layer. Stone passes hide it (and the
      // contact-shadow discs) from CAMERA ONLY — light bounce is preserved.
      const background = recipe.background as Record<string, unknown>;
      expect(background.visible_camera).toBe(false);

      // NO postprocess stage may paint over the transparent layer's alpha:
      // product enhancement AND every fallback_bounds overlay stage are OFF.
      expect(stageEnabled(recipe, "product")).toBe(false);
      for (const stage of STONE_OVERLAY_STAGES) {
        expect(stageEnabled(recipe, stage)).toBe(false);
      }
    });
  }

  it("METAL pass: opaque, studio_background on, pass_hide_contains = ALL stone tokens, no holdout, no pass-level include/exclude", () => {
    const recipe = buildEnterpriseRecipe(request({ pass: "metal", stoneGroup: undefined }));

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(false);
    expect(studioBackgroundEnabled(recipe)).toBe(true);
    // The floor stays camera-visible on opaque passes — the key is NOT emitted.
    expect("visible_camera" in (recipe.background as Record<string, unknown>)).toBe(false);

    const m = model(recipe);
    const include = m.include_contains as string[];
    const exclude = m.exclude_contains as string[];
    const hide = m.pass_hide_contains as string[];

    // No pass-level filtering: normalization must see the FULL product.
    expect(include).toEqual([]);
    for (const group of STONE_GROUPS) {
      for (const token of groupTokens[group]) {
        expect(exclude).not.toContain(token);
      }
    }

    // Stones are fully HIDDEN (metal renders complete behind where stones sit).
    expect(m.pass_holdout_contains).toBeUndefined();
    expect(hide.length).toBeGreaterThan(0);
    for (const group of STONE_GROUPS) {
      for (const token of groupTokens[group]) {
        expect(hide).toContain(token);
      }
    }
    // Metal tokens must never be hidden in a metal pass.
    for (const token of groupTokens.alloycolour) {
      expect(hide).not.toContain(token);
    }

    // Stone-specific overlay stages must NOT leak onto the metal layer (the
    // stones are hidden — a facet/center-stone overlay would be pure synthesis).
    // Product enhancement (general contrast/sharpness) stays on for the opaque pass.
    expect(stageEnabled(recipe, "product")).toBe(true);
    for (const stage of STONE_OVERLAY_STAGES) {
      expect(stageEnabled(recipe, stage)).toBe(false);
    }
  });

  it("METAL pass deliberately does NOT union fallback STONE tokens into pass_hide_contains", () => {
    // Asymmetry with the stone pass's defensive holdout: a false-positive HIDE
    // punches an unrecoverable hole in the metal layer, and stone fallback
    // tokens routinely collide with metal part names ("center_prong",
    // "pave_band", "diamond_prongs", "stone_setting"). Saved/fallback group
    // tokens only.
    const recipe = buildEnterpriseRecipe(request({ pass: "metal", stoneGroup: undefined }));
    const hide = model(recipe).pass_hide_contains as string[];

    const savedStoneTokens = STONE_GROUPS.flatMap((group) => groupTokens[group]);
    expect([...hide].sort()).toEqual([...new Set(savedStoneTokens)].sort());
    for (const fallbackOnly of ["brilliant", "pave", "zirconia", "gem", "stone", "colored", "side_stone"]) {
      expect(hide).not.toContain(fallbackOnly);
    }
  });

  it("STONE pass guard: a fallback metal token that substring-overlaps the TARGET group's tokens is dropped", () => {
    // Operator saved a target token containing "ring" — the "ring" fallback
    // could then match the target stones' own signatures and hold THEM out.
    const riskyTokens: EnterpriseGroupTokens = {
      alloycolour: ["whitemetal"],
      diamond: ["ring_diamond"],
      stone2: ["sapphire"],
      stone3: ["accent"],
    };
    const recipe = buildEnterpriseRecipe(
      request({ pass: "stone", stoneGroup: "diamond", groupTokens: riskyTokens }),
    );
    const holdout = model(recipe).pass_holdout_contains as string[];

    expect(holdout).toContain("whitemetal"); // saved metal token kept
    expect(holdout).not.toContain("ring"); // overlapping fallback dropped
    expect(holdout).not.toContain("ring_diamond"); // target never held out
    // The non-overlapping fallbacks all survive.
    for (const token of FALLBACK_METAL_TOKENS) {
      if (token === "ring") continue;
      expect(holdout).toContain(token);
    }
  });

  it("FULL pass is unchanged: opaque, studio_background on, and emits NEITHER pass visibility field", () => {
    const recipe = buildEnterpriseRecipe(
      request({ pass: "full", stoneGroup: undefined }),
    );

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(false);
    expect(studioBackgroundEnabled(recipe)).toBe(true);
    // The floor stays camera-visible on opaque passes — the key is NOT emitted.
    expect("visible_camera" in (recipe.background as Record<string, unknown>)).toBe(false);

    const m = model(recipe);
    expect(m.include_contains).toEqual([]);
    expect(m.pass_hide_contains).toBeUndefined();
    expect(m.pass_holdout_contains).toBeUndefined();
    expect("pass_hide_contains" in m).toBe(false);
    expect("pass_holdout_contains" in m).toBe(false);
  });

  it("FULL pass keeps the WHOLE tuned beauty pipeline ON (product + center_stone + symmetry + diamond_facets)", () => {
    const recipe = buildEnterpriseRecipe(
      request({ pass: "full", stoneGroup: undefined }),
    );

    expect(stageEnabled(recipe, "product")).toBe(true);
    for (const stage of STONE_OVERLAY_STAGES) {
      expect(stageEnabled(recipe, stage)).toBe(true);
    }
  });
});

// Live-E2E paint-stage fix: diamond_facets PAINTS synthetic content. When its
// object tokens miss, the worker must SKIP the stage — never paint the fake
// 24-spoke wheel into fallback_bounds_norm (seen live on a 5-small-stone ring's
// FULL pass). The recipe drives this with fallback:"skip" on EVERY pass; the
// worker additionally gates matched bounds at max_bounds_frac (default 25% of
// frame area) so an unreliable too-large match is also skipped. Adjust-only
// stages (center_stone / center_stone_symmetry) only retouch real pixels and
// deliberately KEEP fallback-rectangle behavior (no flag emitted).
describe("buildEnterpriseRecipe — paint-stage fallback contract", () => {
  const PASSES = [
    { pass: "full", stoneGroup: undefined },
    { pass: "metal", stoneGroup: undefined },
    { pass: "stone", stoneGroup: "diamond" },
  ] as const;

  for (const combo of PASSES) {
    it(`${combo.pass} pass: diamond_facets carries fallback:"skip"; adjust-only stages carry NO flag`, () => {
      const recipe = buildEnterpriseRecipe(
        request({ pass: combo.pass, stoneGroup: combo.stoneGroup }),
      );

      expect(postprocessStage(recipe, "diamond_facets")?.fallback).toBe("skip");
      expect(postprocessStage(recipe, "center_stone")?.fallback).toBeUndefined();
      expect(postprocessStage(recipe, "center_stone_symmetry")?.fallback).toBeUndefined();
    });
  }
});

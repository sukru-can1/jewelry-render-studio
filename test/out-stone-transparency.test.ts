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
//     (non-target objects occlude without rendering); render.transparent stays true,
//     studio_background stays off.
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

function studioBackgroundEnabled(recipe: Record<string, unknown>): boolean {
  const pp = recipe.postprocess as Record<string, unknown> | undefined;
  const sb = pp?.studio_background as Record<string, unknown> | undefined;
  return sb?.enabled === true;
}

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
      // ...and NONE of the target group's tokens (target must stay visible).
      for (const token of groupTokens[stoneGroup]) {
        expect(holdout).not.toContain(token);
      }

      expect(studioBackgroundEnabled(recipe)).toBe(false);
    });
  }

  it("METAL pass: opaque, studio_background on, pass_hide_contains = ALL stone tokens, no holdout, no pass-level include/exclude", () => {
    const recipe = buildEnterpriseRecipe(request({ pass: "metal", stoneGroup: undefined }));

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(false);
    expect(studioBackgroundEnabled(recipe)).toBe(true);

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
  });

  it("FULL pass is unchanged: opaque, studio_background on, and emits NEITHER pass visibility field", () => {
    const recipe = buildEnterpriseRecipe(
      request({ pass: "full", stoneGroup: undefined }),
    );

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(false);
    expect(studioBackgroundEnabled(recipe)).toBe(true);

    const m = model(recipe);
    expect(m.include_contains).toEqual([]);
    expect(m.pass_hide_contains).toBeUndefined();
    expect(m.pass_holdout_contains).toBeUndefined();
    expect("pass_hide_contains" in m).toBe(false);
    expect("pass_holdout_contains" in m).toBe(false);
  });
});

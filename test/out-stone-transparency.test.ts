// OUT-01 (RED scaffold) — a STONE-pass recipe must produce a true transparent-PNG
// holdout: render.transparent===true, metal tokens EXCLUDED (true holdout, not just
// hidden behind a background), and studio_background DISABLED. A METAL pass stays
// opaque with studio_background enabled. The FULL pass is unchanged.
//
// This RED-fails today because buildEnterpriseRecipe hardcodes render.transparent:false
// for every pass and always enables postprocess.studio_background. Plan 02/W1 fixes it.
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

function studioBackgroundEnabled(recipe: Record<string, unknown>): boolean {
  const pp = recipe.postprocess as Record<string, unknown> | undefined;
  const sb = pp?.studio_background as Record<string, unknown> | undefined;
  return sb?.enabled === true;
}

// NOTE: this unit test inspects only recipe FLAGS — it cannot see rendered pixels.
// The live manual render (05-VALIDATION row) is the BINDING check for actual alpha
// and for no metal bleeding into a stone holdout. Here we only prove the flags.
describe("buildEnterpriseRecipe — stone-pass transparency holdout (OUT-01)", () => {
  for (const stoneGroup of ["diamond", "stone2", "stone3"] as const) {
    it(`STONE pass (${stoneGroup}): transparent, include ONLY the stone group (non-empty, metal-disjoint), metal excluded, studio_background off`, () => {
      const recipe = buildEnterpriseRecipe(request({ pass: "stone", stoneGroup }));

      const render = recipe.render as Record<string, unknown>;
      expect(render.transparent).toBe(true);

      const model = recipe.model as Record<string, unknown>;
      const include = model.include_contains as string[];
      const exclude = model.exclude_contains as string[];
      const metalTokens = groupTokens.alloycolour;

      // include must be NON-EMPTY (else the hard allow-list hides everything).
      expect(include.length).toBeGreaterThan(0);
      // include must be DISJOINT from the metal tokens (no metal in a stone holdout).
      for (const token of metalTokens) {
        expect(include).not.toContain(token);
      }
      // include must be exactly the target stone group's tokens.
      for (const token of groupTokens[stoneGroup]) {
        expect(include).toContain(token);
      }
      // exclude must be a SUPERSET of every alloy/metal token (metal held out).
      for (const token of metalTokens) {
        expect(exclude).toContain(token);
      }

      expect(studioBackgroundEnabled(recipe)).toBe(false);
    });
  }

  it("METAL pass stays opaque with studio_background enabled", () => {
    const recipe = buildEnterpriseRecipe(request({ pass: "metal" }));

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(false);
    expect(studioBackgroundEnabled(recipe)).toBe(true);
  });

  it("FULL pass is unchanged (opaque, studio_background enabled)", () => {
    const recipe = buildEnterpriseRecipe(
      request({ pass: "full", stoneGroup: undefined }),
    );

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(false);
    expect(studioBackgroundEnabled(recipe)).toBe(true);
  });
});

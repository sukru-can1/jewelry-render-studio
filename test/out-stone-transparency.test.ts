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

describe("buildEnterpriseRecipe — stone-pass transparency holdout (OUT-01)", () => {
  it("STONE pass: render.transparent true, metal excluded, studio_background off", () => {
    const recipe = buildEnterpriseRecipe(
      request({ pass: "stone", stoneGroup: "diamond" }),
    );

    const render = recipe.render as Record<string, unknown>;
    expect(render.transparent).toBe(true);

    const model = recipe.model as Record<string, unknown>;
    const exclude = model.exclude_contains as string[];
    // True holdout: every alloy/metal token is excluded from the stone pass.
    for (const token of groupTokens.alloycolour) {
      expect(exclude).toContain(token);
    }

    expect(studioBackgroundEnabled(recipe)).toBe(false);
  });

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

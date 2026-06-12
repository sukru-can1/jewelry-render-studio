// studio_background white-sweep calibration — recipe contract (live-render fix).
//
// Evidence chain: the worker's Light Path floor/backdrop (WORKER_BUILD
// 20260612-white-sweep-r4 and later) renders clipped TRUE WHITE to camera.
// replace_studio_background (postprocess.py) paints a synthetic sweep and
// PROTECTS the product rectangles from object_image_bounds — when the painted
// sweep is DARKER than the raw render (the old [247,247,246]/[237,237,235]
// greys, and the postprocess defaults [246,246,245]/[238,238,236]), every
// protected rectangle shows as a WHITE patch against the grey paint:
// polarity-flipped seams around the product.
//
// Calibration contract asserted here (recipe-level ONLY — postprocess.py
// defaults stay untouched for legacy recipes):
//   - top_color   [253, 253, 252]  — just under raw clipped white
//   - floor_color [249, 249, 247]  — near-white floor mix
//   - vignette    4                — subtle; a strong vignette re-darkens the
//                                    corners away from the raw white
// The block is emitted (with these values) on EVERY pass — stone passes carry
// it disabled — so all layers share one calibration source of truth.
import { describe, expect, it } from "vitest";

import {
  buildEnterpriseRecipe,
  type EnterpriseAngleKey,
  type EnterprisePass,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";

const ANGLE_KEYS: EnterpriseAngleKey[] = ["hero", "front", "top", "profile"];
const PASSES: EnterprisePass[] = ["full", "metal", "stone"];

function request(overrides: Partial<EnterpriseRecipeRequest>): EnterpriseRecipeRequest {
  return {
    angle: "hero",
    metal: "white",
    pass: "full",
    groupTokens: {
      alloycolour: ["metal", "band", "shank", "prong", "gold"],
      diamond: ["diamond", "center", "round"],
      stone2: ["sapphire"],
      stone3: ["accent"],
    },
    stoneMaterials: { diamond: "diamond", stone2: "sapphire", stone3: "ruby" },
    productName: "ring99",
    resolution: 1920,
    samples: 64,
    ...overrides,
  };
}

function studioBackground(recipe: Record<string, unknown>) {
  const pp = recipe.postprocess as Record<string, unknown>;
  return pp.studio_background as Record<string, unknown>;
}

describe("postprocess.studio_background — white-sweep color calibration", () => {
  for (const angle of ANGLE_KEYS) {
    for (const pass of PASSES) {
      it(`${angle}/${pass} paints near-white: top [253,253,252], floor [249,249,247], vignette 4`, () => {
        const recipe = buildEnterpriseRecipe(
          request({ angle, pass, ...(pass === "stone" ? { stoneGroup: "diamond" } : {}) }),
        );
        const sweep = studioBackground(recipe);
        expect(sweep.top_color).toEqual([253, 253, 252]);
        expect(sweep.floor_color).toEqual([249, 249, 247]);
        expect(sweep.vignette).toBe(4);
      });
    }
  }

  it("the sweep must never paint darker than the raw clipped-white render allows (>= 247 per channel)", () => {
    // Regression guard for the polarity flip: any future "tasteful grey"
    // re-darkening reintroduces white product-rectangle patches against the
    // painted sweep. Keep every painted channel within ~8 levels of white.
    const sweep = studioBackground(buildEnterpriseRecipe(request({})));
    for (const channel of [...(sweep.top_color as number[]), ...(sweep.floor_color as number[])]) {
      expect(channel).toBeGreaterThanOrEqual(247);
    }
    expect(sweep.vignette as number).toBeLessThanOrEqual(4);
  });

  it("enabled-flag contract: DISABLED for all passes (the 2D repaint erased product pixels; raw bg is true white)", () => {
    expect(studioBackground(buildEnterpriseRecipe(request({ pass: "full" }))).enabled).toBe(false);
    expect(studioBackground(buildEnterpriseRecipe(request({ pass: "metal" }))).enabled).toBe(false);
    expect(
      studioBackground(buildEnterpriseRecipe(request({ pass: "stone", stoneGroup: "diamond" }))).enabled,
    ).toBe(false);
  });
});

// Catalog backdrop — recipe contract (live-render background fix).
//
// Evidence chain: auto_orient stands products upright and auto_frame raises the
// camera target, so every enterprise preset views the studio FLOOR at a grazing
// angle — the entire frame background became floor, showing the product's big
// soft shadow (dark wedge) and rectangular area-light pools. Cards/DOF/
// plane-size/floor-specular were ruled out by isolation renders. A real catalog
// studio has a vertical backdrop (sweep) behind the product; our scene only had
// a floor.
//
// The worker (render_scene.py add_catalog_backdrop) creates a large vertical
// EMISSION plane behind the product when background.backdrop.enabled is true:
//   - camera-only visibility — every indirect light-path contribution
//     (diffuse/glossy/transmission/volume_scatter/shadow) is disabled, so it
//     paints pure backdrop pixels without adding ANY light to the scene;
//   - on stone passes (background.visible_camera === false) the backdrop is
//     ALSO hidden from camera, keeping the stones-on-alpha layer clean.
//
// The recipe side of that contract is asserted here: backdrop.enabled is
// emitted on EVERY pass of EVERY angle, and ONLY `enabled` is emitted — the
// worker defaults govern distance/size/color/strength so they stay tunable
// in one place.
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

function background(recipe: Record<string, unknown>) {
  return recipe.background as Record<string, unknown>;
}

function backdrop(recipe: Record<string, unknown>) {
  return background(recipe).backdrop as Record<string, unknown>;
}

describe("background.backdrop — emitted on every pass of every angle", () => {
  for (const angle of ANGLE_KEYS) {
    for (const pass of PASSES) {
      it(`${angle}/${pass} emits background.backdrop.enabled === true`, () => {
        const recipe = buildEnterpriseRecipe(
          request({ angle, pass, ...(pass === "stone" ? { stoneGroup: "diamond" } : {}) }),
        );
        expect(backdrop(recipe).enabled).toBe(true);
      });
    }
  }
});

describe("background.backdrop — worker defaults govern everything but `enabled`", () => {
  it("ONLY `enabled` is emitted — no distance/size/color/strength override", () => {
    for (const pass of PASSES) {
      const recipe = buildEnterpriseRecipe(
        request({ pass, ...(pass === "stone" ? { stoneGroup: "diamond" } : {}) }),
      );
      expect(Object.keys(backdrop(recipe))).toEqual(["enabled"]);
    }
  });

  it("the backdrop block is byte-identical across passes", () => {
    const full = buildEnterpriseRecipe(request({ pass: "full" }));
    const metal = buildEnterpriseRecipe(request({ pass: "metal" }));
    const stone = buildEnterpriseRecipe(request({ pass: "stone", stoneGroup: "diamond" }));
    expect(JSON.stringify(backdrop(metal))).toBe(JSON.stringify(backdrop(full)));
    expect(JSON.stringify(backdrop(stone))).toBe(JSON.stringify(backdrop(full)));
  });
});

describe("background.backdrop — stone-pass camera flag still flows (worker extends it to the backdrop)", () => {
  it("stone passes keep background.visible_camera === false alongside the backdrop", () => {
    const recipe = buildEnterpriseRecipe(request({ pass: "stone", stoneGroup: "diamond" }));
    expect(background(recipe).visible_camera).toBe(false);
    expect(backdrop(recipe).enabled).toBe(true);
  });

  it("metal/full passes still do NOT emit visible_camera (floor + backdrop stay visible)", () => {
    for (const pass of ["full", "metal"] as const) {
      const recipe = buildEnterpriseRecipe(request({ pass }));
      expect("visible_camera" in background(recipe)).toBe(false);
    }
  });
});

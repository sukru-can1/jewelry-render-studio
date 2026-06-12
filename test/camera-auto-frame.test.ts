// Deterministic camera auto-framing — recipe contract.
//
// Auto-orient stands uploaded models upright (z spans ~[0, 2.05] after
// ground_to_plane), but the enterprise camera presets were hand-tuned on a
// low/flat pose — on an upright ring they frame the band's bottom arc and crop
// the head (stones) above the frame. Instead of fragile per-shape preset
// retuning, EVERY pass's camera block emits auto_frame: true: the worker
// (render_scene.py setup_camera/auto_frame_camera) keeps the preset's look
// direction, re-targets the full-product bbox center and recomputes the
// distance so the max bbox dimension fits the FOV (half_fov = atan(18/f),
// worker-default frame_margin 1.18).
//
// CRITICAL pass invariant: the worker computes the bbox from ALL kept product
// objects — NOT filtered by pass visibility — so full/metal/stone passes frame
// identically and the layers stay aligned for compositing. The recipe side of
// that invariant is asserted here: auto_frame and the directional preset are
// byte-identical across passes.
import { describe, expect, it } from "vitest";

import {
  buildEnterpriseRecipe,
  enterpriseAngles,
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

function camera(recipe: Record<string, unknown>) {
  return recipe.camera as Record<string, unknown>;
}

describe("camera.auto_frame — emitted on every pass of every angle", () => {
  for (const angle of ANGLE_KEYS) {
    for (const pass of PASSES) {
      it(`${angle}/${pass} emits camera.auto_frame === true`, () => {
        const recipe = buildEnterpriseRecipe(
          request({ angle, pass, ...(pass === "stone" ? { stoneGroup: "diamond" } : {}) }),
        );
        expect(camera(recipe).auto_frame).toBe(true);
      });
    }
  }
});

describe("camera.auto_frame — preset stays the directional intent", () => {
  it("position/target/focal_length are the unmodified preset values (worker recomputes distance, not the recipe)", () => {
    for (const angle of ANGLE_KEYS) {
      const recipe = buildEnterpriseRecipe(request({ angle }));
      expect(camera(recipe)).toEqual(enterpriseAngles[angle].camera);
    }
  });

  it("frame_margin is NOT emitted — the worker default (1.18) governs", () => {
    for (const angle of ANGLE_KEYS) {
      const recipe = buildEnterpriseRecipe(request({ angle }));
      expect("frame_margin" in camera(recipe)).toBe(false);
    }
  });

  it("the camera block is byte-identical across passes (shared framing basis for layer alignment)", () => {
    for (const angle of ANGLE_KEYS) {
      const full = buildEnterpriseRecipe(request({ angle, pass: "full" }));
      const metal = buildEnterpriseRecipe(request({ angle, pass: "metal" }));
      const stone = buildEnterpriseRecipe(
        request({ angle, pass: "stone", stoneGroup: "diamond" }),
      );
      expect(JSON.stringify(camera(metal))).toBe(JSON.stringify(camera(full)));
      expect(JSON.stringify(camera(stone))).toBe(JSON.stringify(camera(full)));
    }
  });
});

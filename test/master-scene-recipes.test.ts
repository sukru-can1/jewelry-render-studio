// buildMasterSceneRecipe — the v203 product-swap pipeline's recipe contract.
//
// What is locked here:
//   1. GOLDEN sha256 byte-stability for this NEW builder (full + stone): the
//     recipe JSON is the quality source of truth; regenerate the hashes ONLY
//     for deliberate quality changes and list the reason in this header.
//   2. The master_scene block shape the worker (render_scene.py
//      setup_master_scene, WORKER_BUILD 20260612-master-scene-r7) consumes:
//      enabled / reference_contains / pose_* / adjustments / camera hide.
//   3. The angle -> pose mapping ported 1:1 from the proven v203a..e recipes
//      (outputs/ring99/recipes/) — rotation/scale/translation/exposure.
//   4. material_map routing from saved groupTokens (metal preset by
//      request.metal, stone material per group) + fallback nets — the SAME
//      dialect as buildEnterpriseRecipe.
//   5. Layered-pass visibility: metal -> pass_hide_contains, stone ->
//      pass_holdout_contains + transparent film + camera_hide_contains,
//      full -> neither.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildMasterSceneRecipe,
  MASTER_EXTRA_POSES,
  MASTER_POSES,
  MASTER_REFERENCE_CONTAINS,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";
import { buildMasterSceneRecipe as buildFromSibling } from "@/lib/master-scene-recipes";

const GOLDEN_FULL_SHA256 =
  "eac0c9a291343a7baafc548c505cbd01019611cb058b5cb5db8e3b029d15c687";
const GOLDEN_STONE_SHA256 =
  "84f59eaf2a531b97c004d3dccce914b6853b13256a7bc0607170bf4299762637";

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

const reqMetal: EnterpriseRecipeRequest = { ...reqFull, pass: "metal" };

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

type AnyRecipe = Record<string, any>;

describe("byte-stable goldens (deliberate regenerations must be listed in the header)", () => {
  it("full/hero/white matches the golden sha256", () => {
    expect(sha256(buildMasterSceneRecipe(reqFull))).toBe(GOLDEN_FULL_SHA256);
  });

  it("stone/front/rose matches the golden sha256", () => {
    expect(sha256(buildMasterSceneRecipe(reqStone))).toBe(GOLDEN_STONE_SHA256);
  });

  it("is re-exported from enterprise-recipes (same function as the sibling module)", () => {
    expect(buildFromSibling).toBe(buildMasterSceneRecipe);
  });
});

describe("master_scene block — the worker contract", () => {
  const recipe = buildMasterSceneRecipe(reqFull) as AnyRecipe;
  const master = recipe.master_scene;

  it("enables the master pipeline with the v203 reference product tokens", () => {
    expect(master.enabled).toBe(true);
    expect(master.reference_contains).toEqual([
      "Diamond_Round",
      "Prong",
      "MASTER_SCENE_realistic_polished_gold",
      "Shiny Gold",
    ]);
    expect(master.reference_contains).toEqual([...MASTER_REFERENCE_CONTAINS]);
    expect(master.apply_recipe_materials).toBe(true);
  });

  it("carries the v203 studio trim (light adjustments, helper-card adjustments, 3 adaptive cards)", () => {
    expect(master.light_adjustments).toEqual([
      { contains: ["large_front_left_softbox"], power_scale: 0.84 },
      { contains: ["weak_front_right_fill"], power_scale: 0.58 },
      { contains: ["low_top_softbox"], power_scale: 0.52 },
      { contains: ["diamond_micro_sparkle"], power_scale: 2.18, color: [0.93, 0.975, 1.0] },
    ]);
    expect(master.object_adjustments.map((a: AnyRecipe) => a.contains)).toEqual([
      ["NEWS_FINAL_diamond_dark_facet_card"],
      ["MASTER_SCENE_soft_gray_side_reflection"],
    ]);
    expect(master.reflection_cards.map((c: AnyRecipe) => c.name)).toEqual([
      "adaptive_reflection_card_left_dark_facet",
      "adaptive_reflection_card_right_soft_lift",
      "adaptive_reflection_card_top_narrow_dark",
    ]);
  });

  it("does NOT emit a procedural studio (no lights/camera/background/reflection_cards top-level)", () => {
    expect(recipe.lights).toBeUndefined();
    expect(recipe.camera).toBeUndefined();
    expect(recipe.background).toBeUndefined();
    expect(recipe.reflection_cards).toBeUndefined();
    expect(recipe.contact_shadows).toBeUndefined();
  });
});

describe("angle -> pose mapping (ported 1:1 from v203a..e; provenance in pose_source)", () => {
  // The v203 table: rotation/scale/translation from group_adjustments,
  // exposure from render.exposure of the matching recipe.
  const expected = {
    hero: {
      source: "v203a_close_front_hero",
      rotation: [-16, 0, -16],
      scale: 0.95,
      translation: [0.0, 0.0, -0.01],
      exposure: -0.94,
    },
    front: {
      source: "v203b_close_catalog_left",
      rotation: [0, 0, -34],
      scale: 0.91,
      translation: [-0.004, 0.0, -0.01],
      exposure: -0.95,
    },
    top: {
      source: "v203e_close_upper_ring_shape",
      rotation: [12, 0, -26],
      scale: 0.9,
      translation: [0.0, 0.0, -0.006],
      exposure: -0.93,
    },
    profile: {
      source: "v203d_close_low_side",
      rotation: [-7, 0, -74],
      scale: 0.88,
      translation: [0.0, 0.0, -0.008],
      exposure: -0.96,
    },
  } as const;

  for (const [angle, pose] of Object.entries(expected)) {
    it(`${angle} <- ${pose.source}`, () => {
      const recipe = buildMasterSceneRecipe({
        ...reqFull,
        angle: angle as EnterpriseRecipeRequest["angle"],
      }) as AnyRecipe;
      expect(recipe.master_scene.pose_rotation_degrees).toEqual([...pose.rotation]);
      expect(recipe.master_scene.pose_scale).toBe(pose.scale);
      expect(recipe.master_scene.pose_translation).toEqual([...pose.translation]);
      expect(recipe.render.exposure).toBe(pose.exposure);
      expect(recipe.enterprise.pose_source).toBe(pose.source);
      expect(MASTER_POSES[angle as keyof typeof MASTER_POSES].source).toBe(pose.source);
    });
  }

  it("keeps v203c_close_catalog_right as the exported 5th pose (no 5th angle key)", () => {
    expect(MASTER_EXTRA_POSES.catalog_right).toEqual({
      label: "close catalog right",
      source: "v203c_close_catalog_right",
      rotation: [0, 0, 34],
      scale: 0.91,
      translation: [0.004, 0.0, -0.01],
      exposure: -0.95,
    });
  });
});

describe("material_map from groupTokens (same dialect as buildEnterpriseRecipe)", () => {
  const recipe = buildMasterSceneRecipe(reqFull) as AnyRecipe;

  it("routes saved tokens first, then the fallback nets", () => {
    expect(recipe.material_map[0]).toEqual({
      contains: ["center_diamond glass"],
      material: "stone_diamond",
    });
    expect(recipe.material_map[3]).toEqual({
      contains: ["band_metal gold"],
      material: "selected_metal",
    });
    expect(recipe.material_map[4].material).toBe("stone_diamond");
    expect(recipe.material_map[5].material).toBe("selected_metal");
  });

  it("selected_metal carries the request.metal preset (white)", () => {
    expect(recipe.material_strategy).toBe("override");
    expect(recipe.materials.selected_metal).toEqual({
      type: "metal",
      base_color: [0.42, 0.435, 0.455, 1.0],
      metallic: 1.0,
      roughness: 0.29,
      specular_ior_level: 0.72,
    });
  });

  it("stone materials map per group through the shared presets", () => {
    const stone = buildMasterSceneRecipe(reqStone) as AnyRecipe;
    expect(stone.materials.selected_metal.base_color).toEqual([0.78, 0.5, 0.42, 1.0]); // rose
    expect(stone.material_map[1].material).toBe("stone_sapphire"); // stone2 preset
    expect(stone.materials.stone_sapphire.ior).toBe(1.77);
  });
});

describe("layered passes", () => {
  it("full pass: no pass fields, opaque film, no camera hide", () => {
    const recipe = buildMasterSceneRecipe(reqFull) as AnyRecipe;
    expect(recipe.model.pass_hide_contains).toBeUndefined();
    expect(recipe.model.pass_holdout_contains).toBeUndefined();
    expect(recipe.render.transparent).toBe(false);
    expect(recipe.master_scene.camera_hide_contains).toBeUndefined();
  });

  it("metal pass: stones hidden via pass_hide_contains, no holdout", () => {
    const recipe = buildMasterSceneRecipe(reqMetal) as AnyRecipe;
    expect(recipe.model.pass_hide_contains).toContain("center_diamond glass");
    expect(recipe.model.pass_holdout_contains).toBeUndefined();
    expect(recipe.render.transparent).toBe(false);
  });

  it("stone pass: non-targets held out, transparent film, studio camera-hidden", () => {
    const recipe = buildMasterSceneRecipe(reqStone) as AnyRecipe;
    expect(recipe.model.pass_hide_contains).toBeUndefined();
    expect(recipe.model.pass_holdout_contains).toContain("band_metal gold");
    expect(recipe.render.transparent).toBe(true);
    expect(recipe.master_scene.camera_hide_contains).toContain("floor");
    expect(recipe.master_scene.camera_hide_contains).toContain("master_scene");
  });

  it("model block stays reference-fit driven: no auto_center/auto_scale/ground_to_plane emitted", () => {
    const recipe = buildMasterSceneRecipe(reqFull) as AnyRecipe;
    expect(recipe.model.auto_orient).toBe(true);
    expect(recipe.model.auto_center).toBeUndefined();
    expect(recipe.model.auto_scale).toBeUndefined();
    expect(recipe.model.ground_to_plane).toBeUndefined();
    expect(recipe.model.target_size).toBeUndefined();
  });
});

describe("recipe identity", () => {
  it("names follow master_<product>_<pass>_<metal>_<stoneGroup|all>_<angle>", () => {
    expect((buildMasterSceneRecipe(reqFull) as AnyRecipe).name).toBe(
      "master_ring_99_full_white_all_hero"
    );
    expect((buildMasterSceneRecipe(reqStone) as AnyRecipe).name).toBe(
      "master_ring_99_stone_rose_diamond_front"
    );
  });

  it("tags the workflow for downstream consumers", () => {
    const recipe = buildMasterSceneRecipe(reqFull) as AnyRecipe;
    expect(recipe.enterprise.workflow).toBe("master_scene_catalog");
    expect(recipe.enterprise.metal_label).toBe("white gold");
  });
});

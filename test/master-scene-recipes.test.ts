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
//   4. material_map routing from saved groupTokens + fallback nets — the SAME
//      token dialect as buildEnterpriseRecipe, but every rule sources the
//      MASTER's materials (v203a law, see regeneration note below).
//   5. Layered-pass visibility: metal -> pass_hide_contains, stone ->
//      pass_holdout_contains + transparent film + camera_hide_contains,
//      full -> neither.
//
// GOLDEN regenerations:
//   1. (FULL + STONE) v203a MATERIAL LAW port (live-E2E fix, batch cmqanibvd):
//      the procedural override materials rendered chalky stones / washed metal
//      vs the v203 contact sheet. material_strategy override -> hybrid; every
//      material_map rule now carries source_material ("Dimond" for the center
//      group, "MASTER_SCENE_clear_cut_diamond_glass" for side groups,
//      "MASTER_SCENE_realistic_polished_gold" for metal) +
//      source_material_adjust ported VERBATIM from v203a_close_front_hero
//      (white metal = the proven [0.372,0.392,0.424] retint); materials: {}.
//   2. (FULL + STONE) explicit master-camera DOF policy: worker refocuses the
//      authored camera after product swap and uses f/16 so cloud beauty renders
//      do not inherit stale/deleted reference-product focus and render soft.
//   3. (FULL + STONE) DOF policy REVERTED to authored-camera default: the
//      forced bbox-center/f16 refocus rendered the whole product soft at
//      macro scale — live batch cmqaqwh38 scored 1/5 on both angles (GPT
//      vision verdict: milky, blown, no facet contrast). The normalization
//      invariant makes the artist's hand-focused camera correct for ANY
//      swapped product; the worker (r9) bakes an object-targeted focus into
//      a scalar before reference deletion, and depth_of_field is now an
//      explicit recipe override only (no longer emitted by the builder).
//   4. (FULL + STONE) CATALOG ANGLES (user directive + Glamira reference
//      sheet): the v203 close poses crop the ring; the catalog standard
//      shows the WHOLE product. Angles now port the legacy Flask app's four
//      proven camera views (view1/view2/view4/Camera az-el orbits about the
//      reference center, distance = max_dim*3.5*scale, f/2.8 focus-on-center)
//      as master_scene.camera_orbit (worker r10). Product pose is zeroed
//      (reference pose, upright); exposure is the uniform v203a -0.94.
//      MASTER_POSES stays exported as the close-up provenance set.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildMasterSceneRecipe,
  MASTER_CATALOG_ORBITS,
  MASTER_EXTRA_POSES,
  MASTER_POSES,
  MASTER_REFERENCE_CONTAINS,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";
import { buildMasterSceneRecipe as buildFromSibling } from "@/lib/master-scene-recipes";

const GOLDEN_FULL_SHA256 =
  "0028a9f0722cd8b980b66cfdf2a2d030eca4e879276320f7459fd68ef603abd4";
const GOLDEN_STONE_SHA256 =
  "28db2e603d215ec0f8b3a16cf8628faeb367d8f772332ecb3a5adde8b4258153";

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

  it("does NOT override the authored camera DOF (regeneration note 3 — the authored focus IS the look)", () => {
    expect(master.depth_of_field).toBeUndefined();
    expect(master.focus_target_offset).toBeUndefined();
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

describe("angle -> catalog orbit (the legacy Flask app's four views; regeneration note 4)", () => {
  // models.py DEFAULT_CAMERA_PRESETS + _create_fresh_scene.py cam_configs.
  const expected = {
    hero: { source: "legacy view1", azimuth: 30, elevation: 25, distance_scale: 1.0, focal_length: 85 },
    front: { source: "legacy view2", azimuth: 180, elevation: 15, distance_scale: 1.0, focal_length: 85 },
    top: { source: "legacy view4", azimuth: -30, elevation: 70, distance_scale: 0.8, focal_length: 85 },
    profile: { source: "legacy Camera", azimuth: -45, elevation: 15, distance_scale: 1.0, focal_length: 50 },
  } as const;

  for (const [angle, orbit] of Object.entries(expected)) {
    it(`${angle} <- ${orbit.source}`, () => {
      const recipe = buildMasterSceneRecipe({
        ...reqFull,
        angle: angle as EnterpriseRecipeRequest["angle"],
      }) as AnyRecipe;
      expect(recipe.master_scene.camera_orbit).toEqual({
        azimuth: orbit.azimuth,
        elevation: orbit.elevation,
        distance_scale: orbit.distance_scale,
        focal_length: orbit.focal_length,
        fstop: 2.8,
      });
      // Product stays in the REFERENCE pose — the camera moves, not the ring.
      expect(recipe.master_scene.pose_rotation_degrees).toEqual([0, 0, 0]);
      expect(recipe.master_scene.pose_scale).toBe(1.0);
      expect(recipe.master_scene.pose_translation).toEqual([0, 0, 0]);
      // Uniform catalog exposure (v203a's studio value).
      expect(recipe.render.exposure).toBe(-0.94);
      expect(recipe.enterprise.pose_source).toBe(orbit.source);
      expect(MASTER_CATALOG_ORBITS[angle as keyof typeof MASTER_CATALOG_ORBITS].source).toBe(
        orbit.source,
      );
    });
  }

  it("the v203 close poses remain exported as provenance (no longer drive angles)", () => {
    expect(MASTER_POSES.hero.source).toBe("v203a_close_front_hero");
    expect(MASTER_POSES.profile.source).toBe("v203d_close_low_side");
  });

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

describe("material_map — the v203a MASTER material law (source_material rules)", () => {
  const recipe = buildMasterSceneRecipe(reqFull) as AnyRecipe;

  it("routes saved tokens first, then the fallback nets — every rule sources a master material", () => {
    expect(recipe.material_map[0].contains).toEqual(["center_diamond glass"]);
    expect(recipe.material_map[0].source_material).toBe("Dimond");
    expect(recipe.material_map[3].contains).toEqual(["band_metal gold"]);
    expect(recipe.material_map[3].source_material).toBe(
      "MASTER_SCENE_realistic_polished_gold",
    );
    expect(recipe.material_map[4].source_material).toBe(
      "MASTER_SCENE_clear_cut_diamond_glass",
    );
    expect(recipe.material_map[5].source_material).toBe(
      "MASTER_SCENE_realistic_polished_gold",
    );
    for (const rule of recipe.material_map) {
      expect(rule.material).toBeUndefined(); // no procedural preset names anywhere
      expect(rule.source_material_adjust).toBeTruthy();
    }
  });

  it("hybrid strategy + empty materials block (the master .blend IS the material source)", () => {
    expect(recipe.material_strategy).toBe("hybrid");
    expect(recipe.materials).toEqual({});
  });

  it("white metal carries the PROVEN v203a retint of the master gold", () => {
    expect(recipe.material_map[3].source_material_adjust).toEqual({
      base_color: [0.372, 0.392, 0.424, 1.0],
      base_color_mix: 1.0,
      diffuse_color: [0.372, 0.392, 0.424, 1.0],
      metallic: 1.0,
      roughness: 0.29,
      specular_ior_level: 0.4,
    });
  });

  it("center diamond carries the verbatim v203a 'Dimond' adjust", () => {
    expect(recipe.material_map[0].source_material_adjust).toEqual({
      glass_color: [0.96, 0.985, 1.0, 1.0],
      glass_color_mix: 0.045,
      glass_roughness: 0.0,
      ior: 2.417,
      saturation_scale: 0.94,
      hsv_value_scale: 0.53,
      hsv_value_max: 0.86,
      diffuse_color: [0.52, 0.56, 0.64, 1.0],
    });
  });

  it("yellow metal keeps the master gold's native color (no base_color override)", () => {
    const yellow = buildMasterSceneRecipe({ ...reqFull, metal: "yellow" }) as AnyRecipe;
    const adjust = yellow.material_map[3].source_material_adjust;
    expect(adjust.base_color).toBeUndefined();
    expect(adjust.metallic).toBe(1.0);
    expect(adjust.roughness).toBe(0.29);
  });

  it("colored stones tint the master glass toward the gem color (sapphire stone2)", () => {
    const stone = buildMasterSceneRecipe(reqStone) as AnyRecipe;
    // rose metal retint flows through the same v203a shape
    expect(stone.material_map[3].source_material_adjust.base_color).toEqual([
      0.78, 0.5, 0.42, 1.0,
    ]);
    const sapphire = stone.material_map[1].source_material_adjust;
    expect(stone.material_map[1].source_material).toBe(
      "MASTER_SCENE_clear_cut_diamond_glass",
    );
    expect(sapphire.glass_color).toEqual([0.07, 0.16, 0.62, 1.0]);
    expect(sapphire.glass_color_mix).toBe(0.9);
    expect(sapphire.ior).toBe(1.77);
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

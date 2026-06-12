// Master-scene recipe builder — the proven v203 pipeline (render INSIDE the
// human-authored studio .blend, swap the product) ported to the enterprise
// recipe layer. See docs/MASTER_SCENE.md for the full recon: the master is
// son2.blend (the "v201 physical-card studio"), uploaded PRIVATE at
// master-scenes/v203-studio.blend; the worker side is render_scene.py
// setup_master_scene() (WORKER_BUILD 20260612-master-scene-r7).
//
// Contract with the worker:
//   - master_scene.enabled        -> open --master instead of an empty scene
//   - reference_contains          -> measure + DELETE the built-in reference
//                                    product; the uploaded model is normalized
//                                    onto its envelope (center + max-dim)
//   - pose_rotation_degrees/_scale/_translation -> per-angle PRODUCT POSE about
//                                    the reference center (camera stays fixed —
//                                    the v203 catalog-angle mechanism)
//   - light_adjustments/object_adjustments/reflection_cards -> the v203 studio
//                                    trim, applied by the shared scene-
//                                    adjustment helpers
//   - camera_hide_contains        -> stone passes: studio surfaces keep
//                                    LIGHTING but stop painting pixels, so
//                                    render.transparent ships stones-on-alpha
//   - model.pass_hide_contains / pass_holdout_contains -> layered passes,
//                                    same buildVisibility dialect as the
//                                    procedural enterprise pipeline
//
// TODO (out of scope for v1 — quality proof first):
//   - dispatch wiring: lib/render/dispatch.ts must pass input.master_scene =
//     { url: workerModelUrl("master-scenes/v203-studio.blend"), pathname }
//     when the recipe carries master_scene.enabled.
//   - batch-builder toggle (choose procedural vs master-scene pipeline).
//   - gallery integration (master-scene jobs reuse the same pass layering).
import {
  buildVisibility,
  FALLBACK_TOKENS,
  METAL_PRESETS,
  slug,
  STONE_PRESETS,
  tokensFor,
  type EnterpriseAngleKey,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";

/**
 * The v203 `PRODUCT_TOKENS` (scripts/create_v203_close_pose_angle_set.py:11) —
 * the master scene's built-in reference product: center/side stones, prongs,
 * and the band meshes carrying the master gold materials. The worker measures
 * these (bbox center + max dimension), then deletes them.
 */
export const MASTER_REFERENCE_CONTAINS = [
  "Diamond_Round",
  "Prong",
  "MASTER_SCENE_realistic_polished_gold",
  "Shiny Gold",
] as const;

export type MasterScenePose = {
  label: string;
  /** Which v203 recipe this pose was ported from (provenance, also tested). */
  source: string;
  /** group_adjustments.rotation_degrees from the v203 recipe -> pose_rotation_degrees. */
  rotation: number[];
  /** group_adjustments.scale -> pose_scale. */
  scale: number;
  /** group_adjustments.translation -> pose_translation. */
  translation: number[];
  /** The v203 per-pose render.exposure. */
  exposure: number;
};

/**
 * Angle -> product pose, ported 1:1 from the five proven v203 recipes
 * (outputs/ring99/recipes/v203a..e). The studio camera is FIXED; each catalog
 * angle is a pose change on the product about the reference center.
 */
export const MASTER_POSES: Record<EnterpriseAngleKey, MasterScenePose> = {
  // v203a_close_front_hero — the v201 base pose, the proven hero framing.
  hero: {
    label: "close front hero",
    source: "v203a_close_front_hero",
    rotation: [-16, 0, -16],
    scale: 0.95,
    translation: [0.0, 0.0, -0.01],
    exposure: -0.94,
  },
  // v203b_close_catalog_left — the standard catalog three-quarter (left) view;
  // the closest v203 pose to a straight catalog "front" presentation.
  front: {
    label: "close catalog left",
    source: "v203b_close_catalog_left",
    rotation: [0, 0, -34],
    scale: 0.91,
    translation: [-0.004, 0.0, -0.01],
    exposure: -0.95,
  },
  // v203e_close_upper_ring_shape — tips the ring back (+12 X) so the table /
  // upper shape faces the camera; the closest v203 pose to a "top" catalog view.
  top: {
    label: "close upper ring shape",
    source: "v203e_close_upper_ring_shape",
    rotation: [12, 0, -26],
    scale: 0.9,
    translation: [0.0, 0.0, -0.006],
    exposure: -0.93,
  },
  // v203d_close_low_side — Z -74 turns the band nearly side-on: the profile view.
  profile: {
    label: "close low side profile",
    source: "v203d_close_low_side",
    rotation: [-7, 0, -74],
    scale: 0.88,
    translation: [0.0, 0.0, -0.008],
    exposure: -0.96,
  },
};

/**
 * The natural 5th v203 pose — v203c_close_catalog_right, the mirror of the
 * `front` (catalog left) pose. EnterpriseAngleKey has four keys, so it is
 * exported separately for future angle expansion / ad-hoc sweeps.
 */
export const MASTER_EXTRA_POSES: Record<string, MasterScenePose> = {
  catalog_right: {
    label: "close catalog right",
    source: "v203c_close_catalog_right",
    rotation: [0, 0, 34],
    scale: 0.91,
    translation: [0.004, 0.0, -0.01],
    exposure: -0.95,
  },
};

// The v203 studio trim, verbatim from v203a (identical across v203a..e):
// softboxes dimmed for contrast, the micro-sparkle pin boosted and cooled.
const V203_LIGHT_ADJUSTMENTS = [
  { contains: ["large_front_left_softbox"], power_scale: 0.84 },
  { contains: ["weak_front_right_fill"], power_scale: 0.58 },
  { contains: ["low_top_softbox"], power_scale: 0.52 },
  { contains: ["diamond_micro_sparkle"], power_scale: 2.18, color: [0.93, 0.975, 1.0] },
];

// v203a object_adjustments: material trims on two son2 studio helper meshes.
// Token no-match on a different master .blend = clean no-op.
const V203_OBJECT_ADJUSTMENTS = [
  {
    contains: ["NEWS_FINAL_diamond_dark_facet_card"],
    source_material_adjust: {
      base_color: [0.012, 0.012, 0.015, 1.0],
      diffuse_color: [0.012, 0.012, 0.015, 1.0],
      emission_color: [0.012, 0.012, 0.015, 1.0],
      emission_strength_scale: 0.54,
    },
  },
  {
    contains: ["MASTER_SCENE_soft_gray_side_reflection"],
    source_material_adjust: {
      base_color: [0.36, 0.36, 0.374, 1.0],
      diffuse_color: [0.36, 0.36, 0.374, 1.0],
      emission_color: [0.36, 0.36, 0.374, 1.0],
      emission_strength_scale: 0.88,
    },
  },
];

// The three v203a adaptive reflection cards (glossy + transmission only) —
// left dark facet break, right soft lift, top narrow dark.
const V203_REFLECTION_CARDS = [
  {
    name: "adaptive_reflection_card_left_dark_facet",
    position: [-1.75, -0.92, 1.55],
    rotation_degrees: [58, 0, -44],
    size: [1.25, 1.05],
    color: [0.015, 0.015, 0.018, 1.0],
    visible_to_camera: false,
    visible_to_shadow: false,
    visible_to_diffuse: false,
    visible_to_glossy: true,
    visible_to_transmission: true,
    visible_to_volume_scatter: false,
  },
  {
    name: "adaptive_reflection_card_right_soft_lift",
    position: [2.15, -1.15, 1.25],
    rotation_degrees: [64, 0, 50],
    size: [1.55, 1.0],
    color: [0.38, 0.38, 0.383, 1.0],
    visible_to_camera: false,
    visible_to_shadow: false,
    visible_to_diffuse: false,
    visible_to_glossy: true,
    visible_to_transmission: true,
    visible_to_volume_scatter: false,
  },
  {
    name: "adaptive_reflection_card_top_narrow_dark",
    position: [-0.1, -0.42, 2.42],
    rotation_degrees: [8, 0, -8],
    size: [1.8, 0.55],
    color: [0.025, 0.025, 0.028, 1.0],
    visible_to_camera: false,
    visible_to_shadow: false,
    visible_to_diffuse: false,
    visible_to_glossy: true,
    visible_to_transmission: true,
    visible_to_volume_scatter: false,
  },
];

// Stone passes: studio surfaces that must keep LIGHTING the stones but stop
// painting camera pixels (legacy lesson: never delete the floor for stone
// layers — visible_camera=false only). Tokens mirror the legacy _is_studio
// heuristic (floor/plane/room/reflection/shadow/master_scene) + the known son2
// helper names; tune after live verification against son2's actual inventory.
const STONE_PASS_CAMERA_HIDE = [
  "floor",
  "plane",
  "room",
  "reflection",
  "shadow",
  "backdrop",
  "sweep",
  "master_scene",
  "news_final",
];

/**
 * Build a v203-style master-scene recipe from the SAME EnterpriseRecipeRequest
 * shape as buildEnterpriseRecipe. The studio .blend supplies camera/lights/
 * cards; this recipe supplies the product swap, pose, materials and layered-
 * pass visibility.
 */
export function buildMasterSceneRecipe(request: EnterpriseRecipeRequest): Record<string, unknown> {
  const pose = MASTER_POSES[request.angle];
  const visibility = buildVisibility(request);
  const metal = METAL_PRESETS[request.metal];

  // Same material routing as the procedural enterprise pipeline: saved group
  // tokens first (metal preset by request.metal, stone material per group),
  // then the fallback nets.
  const materialMap = [
    { contains: tokensFor(request.groupTokens, "diamond"), material: `stone_${request.stoneMaterials.diamond}` },
    { contains: tokensFor(request.groupTokens, "stone2"), material: `stone_${request.stoneMaterials.stone2}` },
    { contains: tokensFor(request.groupTokens, "stone3"), material: `stone_${request.stoneMaterials.stone3}` },
    { contains: tokensFor(request.groupTokens, "alloycolour"), material: "selected_metal" },
    { contains: FALLBACK_TOKENS.diamond, material: "stone_diamond" },
    { contains: FALLBACK_TOKENS.alloycolour, material: "selected_metal" },
  ];

  return {
    name: `master_${slug(request.productName)}_${request.pass}_${request.metal}_${request.stoneGroup || "all"}_${request.angle}`,
    enterprise: {
      workflow: "master_scene_catalog",
      angle: request.angle,
      angle_label: pose.label,
      pose_source: pose.source,
      pass: request.pass,
      metal: request.metal,
      metal_label: metal.label,
      stone_group: request.stoneGroup || null,
    },
    master_scene: {
      enabled: true,
      reference_contains: [...MASTER_REFERENCE_CONTAINS],
      pose_rotation_degrees: pose.rotation,
      pose_scale: pose.scale,
      pose_translation: pose.translation,
      apply_recipe_materials: true,
      light_adjustments: V203_LIGHT_ADJUSTMENTS,
      object_adjustments: V203_OBJECT_ADJUSTMENTS,
      reflection_cards: V203_REFLECTION_CARDS,
      // Stone passes only: hide studio surfaces from camera (lighting kept) so
      // the transparent film ships pure stones-on-alpha for compositing.
      ...(request.pass === "stone" ? { camera_hide_contains: STONE_PASS_CAMERA_HIDE } : {}),
    },
    render: {
      resolution: [request.resolution, request.resolution],
      samples: request.samples,
      denoise: true,
      view_transform: "Filmic",
      look: "Medium High Contrast",
      // Per-pose exposure ported from the matching v203 recipe.
      exposure: pose.exposure,
      gamma: 1.0,
      transparent: request.pass === "stone",
    },
    model: {
      // Stand-upright + head-up orientation BEFORE the reference-envelope fit
      // (worker place_product_on_reference); rotations preserve the max-dim, so
      // the reference scale is orientation-independent.
      auto_orient: true,
      shade_smooth: true,
      shade_smooth_exclude_contains: ["diamond", "stone", "gem", "round", "brilliant", "zirconia"],
      // Layered passes — identical dialect to the procedural pipeline; the
      // worker applies these to the SWAPPED product only (studio surfaces are
      // governed by master_scene.camera_hide_contains).
      ...(visibility.hide.length ? { pass_hide_contains: visibility.hide } : {}),
      ...(visibility.holdout.length ? { pass_holdout_contains: visibility.holdout } : {}),
    },
    material_strategy: "override",
    material_map: materialMap,
    materials: {
      selected_metal: {
        type: "metal",
        base_color: metal.base,
        metallic: 1.0,
        roughness: metal.roughness,
        specular_ior_level: 0.72,
      },
      stone_diamond: STONE_PRESETS.diamond,
      stone_sapphire: STONE_PRESETS.sapphire,
      stone_emerald: STONE_PRESETS.emerald,
      stone_ruby: STONE_PRESETS.ruby,
    },
  };
}

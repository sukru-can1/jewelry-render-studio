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
// App wiring (done):
//   - dispatch: lib/orchestration/dispatch.ts detects master_scene.enabled on a
//     job recipe and passes input.master_scene = { url: workerModelUrl(
//     MASTER_SCENE_BLOB_PATH), pathname } — a fresh presigned GET per submit.
//   - batch builder: pipeline toggle (procedural | master) flows through
//     createBatch -> expandCombos, which calls this builder per combo.
//   - gallery: master-scene jobs reuse the same combo/pass layering, so Layer
//     derivation and the batch gallery work unchanged.
import {
  buildVisibility,
  FALLBACK_TOKENS,
  METAL_PRESETS,
  slug,
  tokensFor,
  type EnterpriseAngleKey,
  type EnterpriseRecipeRequest,
} from "@/lib/enterprise-recipes";

/**
 * Where scripts/upload_master_scene_blend.ts put son2.blend in the PRIVATE blob
 * store. Dispatch mints a presigned worker GET for this pathname per submit —
 * the path is the contract between the upload script and the dispatcher.
 */
export const MASTER_SCENE_BLOB_PATH = "master-scenes/v203-studio.blend";

/**
 * True when a generated recipe carries an enabled master_scene block — the
 * dispatcher's switch for attaching input.master_scene (the studio .blend URL).
 * Tolerant of unknown JSON: anything non-conforming is simply "not master".
 */
export function isMasterSceneRecipe(recipe: unknown): boolean {
  if (typeof recipe !== "object" || recipe === null) return false;
  const master = (recipe as Record<string, unknown>).master_scene;
  if (typeof master !== "object" || master === null) return false;
  return (master as Record<string, unknown>).enabled === true;
}

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

export type MasterCameraOrbit = {
  label: string;
  /** Which legacy camera this orbit ports (provenance, also tested). */
  source: string;
  azimuth: number;
  elevation: number;
  /** Multiplies the worker's distance = ref max_dim * 3.5. */
  distanceScale: number;
  focalLength: number;
};

/**
 * THE CATALOG ANGLES — the legacy Flask app's four proven full-ring views
 * (external-work models.py DEFAULT_CAMERA_PRESETS + _create_fresh_scene.py
 * cam_configs), ported as camera ORBITS about the reference center. The v203
 * close poses crop the ring (head close-ups); these frame the WHOLE product
 * exactly like the Glamira catalog reference. Product stays in its reference
 * pose (upright, head up); the camera moves — the legacy mechanism.
 */
export const MASTER_CATALOG_ORBITS: Record<EnterpriseAngleKey, MasterCameraOrbit> = {
  // view1 — the classic catalog three-quarter hero.
  hero: {
    label: "catalog three-quarter",
    source: "legacy view1",
    azimuth: 30,
    elevation: 25,
    distanceScale: 1.0,
    focalLength: 85,
  },
  // view2 — the straight face-on full circle.
  front: {
    label: "catalog face-on",
    source: "legacy view2",
    azimuth: 180,
    elevation: 15,
    distanceScale: 1.0,
    focalLength: 85,
  },
  // view4 — the high three-quarter (ring seen from above).
  top: {
    label: "catalog high three-quarter",
    source: "legacy view4",
    azimuth: -30,
    elevation: 70,
    distanceScale: 0.8,
    focalLength: 85,
  },
  // "Camera" — the low side three-quarter (wider 50mm lens).
  profile: {
    label: "catalog low side",
    source: "legacy Camera",
    azimuth: -45,
    elevation: 15,
    distanceScale: 1.0,
    focalLength: 50,
  },
};

/**
 * Shrink factor turning the v203 close poses into FULL-RING catalog framing
 * through the AUTHORED camera (the studio's light/card ensemble stays aimed
 * exactly as the artist tuned it). The product stays CENTERED on the
 * reference center — the camera's aim AND the studio's static painted
 * contact-shadow mesh both live there (live r12 batch: grounding pushed the
 * ring low in frame and off its shadow; v203 itself never grounded).
 * 0.55 framed the ring at ~44% of frame height; 0.78 targets ~62%.
 */
const FULL_RING_SCALE = 0.78;

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

// ─── The v203 MATERIAL LAW (ported verbatim from v203a_close_front_hero) ────
//
// Every good image in this repo wore the MASTER'S OWN materials — the recipes
// never overrode the product with procedural shaders. The reference product's
// materials survive in bpy.data after the swap deletes its objects, and the
// worker's assign_materials already honors material_map.source_material +
// source_material_adjust (the hybrid mechanism v203 used). Live E2E batch
// cmqanibvd proved the procedural override reads chalky/washed by comparison.
//
// Source materials inside son2.blend (docs/MASTER_SCENE.md):
//   "Dimond"                                — the center-stone diamond glass
//   "MASTER_SCENE_clear_cut_diamond_glass"  — the side-stone diamond glass
//   "MASTER_SCENE_realistic_polished_gold"  — the hero metal (retintable)

/** v203a center-stone adjust, verbatim (the "Dimond" treatment). */
const MASTER_CENTER_STONE_ADJUST = {
  glass_color: [0.96, 0.985, 1.0, 1.0],
  glass_color_mix: 0.045,
  glass_roughness: 0.0,
  ior: 2.417,
  saturation_scale: 0.94,
  hsv_value_scale: 0.53,
  hsv_value_max: 0.86,
  diffuse_color: [0.52, 0.56, 0.64, 1.0],
};

/** v203a side-stone adjust, verbatim (the clear-cut glass treatment). */
const MASTER_SIDE_STONE_ADJUST = {
  glass_color: [0.92, 0.965, 1.0, 1.0],
  glass_color_mix: 0.02,
  base_color: [0.5, 0.56, 0.66, 1.0],
  base_color_mix: 0.08,
  diffuse_color: [0.48, 0.54, 0.64, 1.0],
  roughness: 0.0,
  glass_roughness: 0.0,
  ior: 2.417,
  saturation_scale: 0.7,
  hsv_value_scale: 0.64,
  hsv_value_max: 0.95,
};

/**
 * v203a metal adjust per enterprise metal. WHITE is the proven v203a tint
 * (the entire ring99 contact sheet is this exact retint of the master gold);
 * YELLOW keeps the master gold's native color (no base_color override);
 * ROSE retints with the rose preset base through the same v203a shape.
 */
const MASTER_METAL_ADJUST: Record<EnterpriseRecipeRequest["metal"], Record<string, unknown>> = {
  white: {
    base_color: [0.372, 0.392, 0.424, 1.0],
    base_color_mix: 1.0,
    diffuse_color: [0.372, 0.392, 0.424, 1.0],
    metallic: 1.0,
    roughness: 0.29,
    specular_ior_level: 0.4,
  },
  yellow: {
    metallic: 1.0,
    roughness: 0.29,
    specular_ior_level: 0.4,
  },
  rose: {
    base_color: [0.78, 0.5, 0.42, 1.0],
    base_color_mix: 1.0,
    diffuse_color: [0.78, 0.5, 0.42, 1.0],
    metallic: 1.0,
    roughness: 0.29,
    specular_ior_level: 0.4,
  },
};

/**
 * Colored-stone tints over the master glass: keep the v203 facet behavior but
 * push the glass color hard toward the gem color (diamond returns the verbatim
 * v203a adjusts above instead).
 */
const MASTER_GEM_TINTS: Record<string, { color: number[]; ior: number }> = {
  sapphire: { color: [0.07, 0.16, 0.62, 1.0], ior: 1.77 },
  emerald: { color: [0.05, 0.42, 0.25, 1.0], ior: 1.58 },
  ruby: { color: [0.65, 0.03, 0.08, 1.0], ior: 1.76 },
};

/** Stone adjust for a group: diamond = verbatim v203a; gems = tinted glass. */
function masterStoneAdjust(
  stoneMaterial: string,
  placement: "center" | "side",
): Record<string, unknown> {
  const base = placement === "center" ? MASTER_CENTER_STONE_ADJUST : MASTER_SIDE_STONE_ADJUST;
  const tint = MASTER_GEM_TINTS[stoneMaterial];
  if (!tint) return { ...base };
  return {
    ...base,
    glass_color: tint.color,
    glass_color_mix: 0.9,
    ior: tint.ior,
    saturation_scale: 1.0,
    hsv_value_scale: 1.0,
    hsv_value_max: 1.0,
    diffuse_color: tint.color,
  };
}

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
 * Optional contrast/light tuning over the v203 baseline — the master
 * pipeline's equivalent of the procedural profileOverrides. Absent = the
 * EXACT v203 values (goldens lock this). exposureOffset ADDS to the per-pose
 * exposure (negative = darker); the *Scale factors MULTIPLY the matching
 * V203_LIGHT_ADJUSTMENTS power_scale entries.
 */
export type MasterSceneTuning = {
  exposureOffset?: number;
  softboxScale?: number;
  fillScale?: number;
  topScale?: number;
  sparkleScale?: number;
};

function tunedLightAdjustments(tuning: MasterSceneTuning) {
  const factor: Record<string, number | undefined> = {
    large_front_left_softbox: tuning.softboxScale,
    weak_front_right_fill: tuning.fillScale,
    low_top_softbox: tuning.topScale,
    diamond_micro_sparkle: tuning.sparkleScale,
  };
  return V203_LIGHT_ADJUSTMENTS.map((adj) => {
    const f = factor[adj.contains[0]];
    if (f === undefined) return adj;
    return { ...adj, power_scale: Number((adj.power_scale * f).toFixed(4)) };
  });
}

/**
 * Build a v203-style master-scene recipe from the SAME EnterpriseRecipeRequest
 * shape as buildEnterpriseRecipe. The studio .blend supplies camera/lights/
 * cards; this recipe supplies the product swap, pose, materials and layered-
 * pass visibility. `tuning` (optional) offsets exposure / scales studio
 * lights over the v203 baseline — absent keys change NOTHING.
 */
export function buildMasterSceneRecipe(
  request: EnterpriseRecipeRequest,
  tuning: MasterSceneTuning = {},
): Record<string, unknown> {
  const pose = MASTER_POSES[request.angle];
  const visibility = buildVisibility(request);
  const metal = METAL_PRESETS[request.metal];

  // Same group-token ROUTING as the procedural pipeline (saved tokens first,
  // then the fallback nets) — but every rule sources the MASTER'S material and
  // adjusts it the v203a way. The diamond group is the CENTER treatment
  // ("Dimond"); stone2/stone3 are SIDE treatments (clear-cut glass); metal is
  // the master gold retinted per the selected metal.
  const metalAdjust = MASTER_METAL_ADJUST[request.metal];
  const materialMap = [
    {
      contains: tokensFor(request.groupTokens, "diamond"),
      source_material: "Dimond",
      source_material_adjust: masterStoneAdjust(request.stoneMaterials.diamond, "center"),
    },
    {
      contains: tokensFor(request.groupTokens, "stone2"),
      source_material: "MASTER_SCENE_clear_cut_diamond_glass",
      source_material_adjust: masterStoneAdjust(request.stoneMaterials.stone2, "side"),
    },
    {
      contains: tokensFor(request.groupTokens, "stone3"),
      source_material: "MASTER_SCENE_clear_cut_diamond_glass",
      source_material_adjust: masterStoneAdjust(request.stoneMaterials.stone3, "side"),
    },
    {
      contains: tokensFor(request.groupTokens, "alloycolour"),
      source_material: "MASTER_SCENE_realistic_polished_gold",
      source_material_adjust: metalAdjust,
    },
    {
      contains: FALLBACK_TOKENS.diamond,
      source_material: "MASTER_SCENE_clear_cut_diamond_glass",
      source_material_adjust: masterStoneAdjust(request.stoneMaterials.diamond, "side"),
    },
    {
      contains: FALLBACK_TOKENS.alloycolour,
      source_material: "MASTER_SCENE_realistic_polished_gold",
      source_material_adjust: metalAdjust,
    },
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
      // FULL-RING CATALOG POSES — the v203 ensemble preserved. The studio's
      // lights + dark cards + AUTHORED camera are a tuned unit; moving the
      // camera (the r11 orbit round) kept the framing but lost the cards'
      // aimed reflections — the stone fire. So: the proven v203 pose per
      // angle, shrunk by FULL_RING_SCALE so the WHOLE ring fits the authored
      // frame, re-grounded onto the reference floor line (worker r12
      // pose_ground_to_reference). camera_orbit remains a worker capability
      // for explicit recipes but is no longer emitted here.
      pose_rotation_degrees: pose.rotation,
      pose_scale: Number((pose.scale * FULL_RING_SCALE).toFixed(4)),
      pose_translation: pose.translation,
      // NO depth_of_field override: the authored camera's DOF IS the look.
      // Products are normalized onto the reference envelope, so the artist's
      // hand-focused camera is correct for any swap; the worker bakes an
      // object-targeted focus into a scalar before the reference is deleted
      // (preserve_camera_focus, r9). The forced bbox-center/f16 refocus
      // rendered everything soft at macro scale (batch cmqaqwh38, GPT
      // verdict 1/5 both angles) — depth_of_field remains available as an
      // explicit recipe override only.
      apply_recipe_materials: true,
      light_adjustments: tunedLightAdjustments(tuning),
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
      // Per-pose exposure from the matching v203 recipe + optional tuning
      // offset, clamped to a sane studio range.
      exposure: Number(
        Math.min(0, Math.max(-2, pose.exposure + (tuning.exposureOffset ?? 0))).toFixed(4),
      ),
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
    // HYBRID, like v203a: rules dress matched objects in the master's own
    // materials (source_material + adjust); an unmatched object keeps its
    // imported material instead of falling back to a procedural preset.
    material_strategy: "hybrid",
    material_map: materialMap,
    // No procedural presets — the master .blend is the material source.
    materials: {},
  };
}

// INTEL-01: the named-knob override contract + the G2 clamp layer. knobs.ts also
// holds the identity baselines (KNOB_DEFAULTS) this generator assembles with, so
// "default knob value" there is provably this file's value (no duplicated magics).
import {
  clamp,
  KNOB_DEFAULTS,
  KNOB_RANGES,
  type ProfileOverrides,
} from "@/lib/intelligence/knobs";

export type EnterpriseAngleKey = "hero" | "front" | "top" | "profile";
export type EnterprisePass = "full" | "metal" | "stone";
export type EnterpriseMetal = "white" | "yellow" | "rose";
export type EnterpriseStoneMaterial = "diamond" | "sapphire" | "emerald" | "ruby";
export type EnterpriseGroupKey = "alloycolour" | "diamond" | "stone2" | "stone3";

export type EnterpriseGroupTokens = Record<EnterpriseGroupKey, string[]>;

export type EnterpriseRecipeRequest = {
  angle: EnterpriseAngleKey;
  groupTokens: EnterpriseGroupTokens;
  metal: EnterpriseMetal;
  pass: EnterprisePass;
  productName: string;
  resolution: number;
  samples: number;
  stoneGroup?: Exclude<EnterpriseGroupKey, "alloycolour">;
  stoneMaterials: Record<Exclude<EnterpriseGroupKey, "alloycolour">, EnterpriseStoneMaterial>;
  // INTEL-01: OPTIONAL clamped knob overrides applied at the END of assembly.
  // Absent (or undefined) -> the output is byte-identical to the classic path.
  profileOverrides?: ProfileOverrides;
};

const METAL_PRESETS: Record<EnterpriseMetal, { label: string; base: number[]; roughness: number }> = {
  white: { label: "white gold", base: [0.42, 0.435, 0.455, 1.0], roughness: 0.29 },
  yellow: { label: "yellow gold", base: [0.86, 0.69, 0.42, 1.0], roughness: 0.31 },
  rose: { label: "rose gold", base: [0.78, 0.5, 0.42, 1.0], roughness: 0.32 }
};

const STONE_PRESETS: Record<EnterpriseStoneMaterial, Record<string, unknown>> = {
  diamond: {
    type: "catalog_diamond",
    glass_color: [0.94, 0.965, 1.0, 1.0],
    gloss_color: [1.0, 1.0, 1.0, 1.0],
    roughness: 0.0,
    gloss_roughness: 0.008,
    ior: 2.417,
    transparent_mix: 0.035
  },
  sapphire: {
    type: "gem",
    base_color: [0.07, 0.16, 0.62, 1.0],
    roughness: 0.005,
    alpha: 0.34,
    transmission_weight: 1.0,
    ior: 1.77
  },
  emerald: {
    type: "gem",
    base_color: [0.05, 0.42, 0.25, 1.0],
    roughness: 0.007,
    alpha: 0.36,
    transmission_weight: 1.0,
    ior: 1.58
  },
  ruby: {
    type: "gem",
    base_color: [0.65, 0.03, 0.08, 1.0],
    roughness: 0.006,
    alpha: 0.35,
    transmission_weight: 1.0,
    ior: 1.76
  }
};

// AUTO-FRAME (live fix): auto_orient stands uploaded models upright (z spans
// ~[0, 2.05] after ground_to_plane), but these camera presets were hand-tuned
// on a low/flat pose — on an upright ring they frame the band's bottom arc and
// crop the head (stones) above the frame. Retuning four presets by hand is
// fragile across product shapes, so every preset emits auto_frame: true: the
// worker keeps the preset's LOOK DIRECTION (position/target stay as the
// directional intent) but re-targets the full-product bbox center and
// recomputes the distance to fit the bbox into the FOV (worker-default
// frame_margin 1.18 — emit camera.frame_margin only to override it).
const ANGLES: Record<
  EnterpriseAngleKey,
  {
    label: string;
    camera: {
      position: number[];
      target: number[];
      focal_length: number;
      auto_frame: boolean;
      depth_of_field: Record<string, unknown>;
    };
    rotation: number[];
    targetSize: number;
  }
> = {
  hero: {
    label: "three quarter hero",
    camera: {
      position: [-2.9, -4.25, 1.85],
      target: [0.0, 0.0, 0.32],
      focal_length: 92,
      auto_frame: true,
      depth_of_field: { enabled: true, f_stop: 8.5 }
    },
    rotation: [-6, 0, 18],
    targetSize: 2.05
  },
  front: {
    label: "straight front",
    camera: {
      position: [0.0, -4.55, 1.18],
      target: [0.0, 0.0, 0.28],
      focal_length: 98,
      auto_frame: true,
      depth_of_field: { enabled: true, f_stop: 9.5 }
    },
    rotation: [-8, 0, 0],
    targetSize: 2.08
  },
  top: {
    label: "top catalog",
    camera: {
      position: [0.0, -4.35, 2.75],
      target: [0.0, 0.0, 0.1],
      focal_length: 92,
      auto_frame: true,
      depth_of_field: { enabled: true, f_stop: 10.5 }
    },
    rotation: [0, 0, 0],
    targetSize: 2.0
  },
  profile: {
    label: "right profile",
    camera: {
      position: [3.0, -4.1, 1.95],
      target: [0.0, 0.0, 0.31],
      focal_length: 92,
      auto_frame: true,
      depth_of_field: { enabled: true, f_stop: 8.5 }
    },
    rotation: [-6, 0, -22],
    targetSize: 2.04
  }
};

const FALLBACK_TOKENS: EnterpriseGroupTokens = {
  alloycolour: ["metal", "band", "ring", "shank", "prong", "basket", "gold", "silver", "platinum", "alloy"],
  diamond: ["diamond", "brilliant", "round", "center", "pave", "zirconia", "gem", "stone"],
  stone2: ["stone2", "sapphire", "emerald", "ruby", "colored"],
  stone3: ["stone3", "accent", "side_stone"]
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "product";
}

function tokensFor(groupTokens: EnterpriseGroupTokens, group: EnterpriseGroupKey) {
  const tokens = groupTokens[group].filter(Boolean);
  return tokens.length ? tokens : FALLBACK_TOKENS[group];
}

function uniqueTokens(tokens: string[]) {
  return Array.from(new Set(tokens.map((token) => token.trim()).filter(Boolean))).slice(0, 120);
}

const STONE_GROUP_KEYS = ["diamond", "stone2", "stone3"] as const;

function buildVisibility(request: EnterpriseRecipeRequest) {
  // LAYERED-PASS FIX (legacy app's proven pattern): passes NO LONGER filter via
  // include_contains/exclude_contains. The worker runs filter_product_objects
  // BEFORE transform_model, so pass-level include/exclude made auto_center/
  // auto_scale/ground_to_plane normalize on the pass subset ALONE — stone passes
  // scaled tiny stones up to target_size (giant diamonds) and every pass got a
  // DIFFERENT transform, so metal/stone layers could never align for compositing.
  //
  // Instead the worker keeps the FULL product as the normalization basis and
  // applies pass visibility AFTER transforms (render_scene.py
  // apply_pass_visibility), driven by two new optional model fields:
  // - metal pass -> pass_hide_contains = ALL stone-group tokens (stones fully
  //   hidden; metal renders complete behind where the stones sit).
  // - stone pass -> pass_holdout_contains = metal tokens + the OTHER stone
  //   groups' tokens + FALLBACK metal tokens (every non-target object occludes
  //   the target — correct silhouettes for compositing — without rendering).
  // - full pass -> neither field (recipe byte-identical to the classic output).
  // include_contains/exclude_contains keep ONLY the junk filtering (lights,
  // cameras, helpers) so the worker still drops non-product objects up front.
  if (request.pass === "metal") {
    // DELIBERATELY NOT mirrored from the stone pass: the hide list stays the
    // saved/fallback group tokens only — no extra fallback STONE token union.
    // Asymmetry: in the stone pass a false-positive HOLDOUT on a metal-ish
    // object is harmless (it was non-target anyway); here a false-positive
    // HIDE punches an unrecoverable hole in the metal layer. Stone fallback
    // tokens routinely collide with metal part names ("center_prong",
    // "pave_band", "round_band", "diamond_prongs", "stone_setting", cut names
    // like "emerald"/"brilliant" on baskets), so the risk outweighs the cover.
    const stoneTokens = STONE_GROUP_KEYS.flatMap((group) => tokensFor(request.groupTokens, group));
    return { hide: uniqueTokens(stoneTokens), holdout: [] as string[] };
  }

  if (request.pass === "stone" && request.stoneGroup) {
    const metalTokens = tokensFor(request.groupTokens, "alloycolour");
    const otherStoneTokens = STONE_GROUP_KEYS.filter((group) => group !== request.stoneGroup).flatMap((group) =>
      tokensFor(request.groupTokens, group)
    );
    // DEFENSIVE HOLDOUT (live E2E fix): the holdout must not depend solely on
    // operator-SAVED metal tokens — a band literally named "Object" with
    // material "WhiteMetal" rendered into the stone layer because the saved
    // alloycolour tokens didn't cover it ("object whitemetal" DOES contain
    // "metal"). ALWAYS union the fallback metal tokens so metal-ish names AND
    // material names hold out even when the saved tokens miss.
    // CRITICAL guard: a fallback token must never be able to match the TARGET
    // stone group's own objects — drop any fallback token that substring-
    // overlaps a target token in either direction (the worker matches by
    // `contains` against "<name> <materials>" signatures). The alloycolour
    // fallback list carries no cut/shape words ("round", "center", ...), so
    // normally all of it survives; this guards odd operator-saved targets
    // like "ring_diamond" (drops "ring").
    const targetTokens = tokensFor(request.groupTokens, request.stoneGroup).map((token) =>
      token.trim().toLowerCase()
    );
    const fallbackMetalTokens = FALLBACK_TOKENS.alloycolour.filter((fallback) => {
      const token = fallback.toLowerCase();
      return !targetTokens.some((target) => target.includes(token) || token.includes(target));
    });
    return {
      hide: [] as string[],
      holdout: uniqueTokens([...metalTokens, ...otherStoneTokens, ...fallbackMetalTokens])
    };
  }

  return { hide: [] as string[], holdout: [] as string[] };
}

export function buildEnterpriseRecipe(request: EnterpriseRecipeRequest): Record<string, unknown> {
  const overrides = request.profileOverrides;
  // INTEL-01 cameraPreset: when present, the FULL ANGLES bundle (camera, rotation,
  // target size, label) for the preset is used INSTEAD of request.angle (symptom
  // 6/9 — e.g. the lower front camera for a dull edge-on stone). The combo
  // COORDINATE (name, enterprise.angle) keeps request.angle — job identity is
  // unchanged. Absent -> behavior identical to today.
  const angle = ANGLES[overrides?.cameraPreset ?? request.angle];
  const visibility = buildVisibility(request);
  const metal = METAL_PRESETS[request.metal];
  const centerTokens = uniqueTokens([
    ...tokensFor(request.groupTokens, request.stoneGroup || "diamond"),
    "center",
    "round",
    "diamond"
  ]);

  const materialMap = [
    { contains: tokensFor(request.groupTokens, "diamond"), material: `stone_${request.stoneMaterials.diamond}` },
    { contains: tokensFor(request.groupTokens, "stone2"), material: `stone_${request.stoneMaterials.stone2}` },
    { contains: tokensFor(request.groupTokens, "stone3"), material: `stone_${request.stoneMaterials.stone3}` },
    { contains: tokensFor(request.groupTokens, "alloycolour"), material: "selected_metal" },
    { contains: FALLBACK_TOKENS.diamond, material: "stone_diamond" },
    { contains: FALLBACK_TOKENS.alloycolour, material: "selected_metal" }
  ];

  const recipe = {
    name: `enterprise_${slug(request.productName)}_${request.pass}_${request.metal}_${request.stoneGroup || "all"}_${request.angle}`,
    enterprise: {
      workflow: "production_catalog",
      angle: request.angle,
      angle_label: angle.label,
      pass: request.pass,
      metal: request.metal,
      metal_label: metal.label,
      stone_group: request.stoneGroup || null
    },
    render: {
      resolution: [request.resolution, request.resolution],
      samples: request.samples,
      denoise: true,
      view_transform: "Filmic",
      look: "Medium High Contrast",
      exposure: KNOB_DEFAULTS.exposure, // -0.58 — the INTEL-01 identity baseline
      gamma: 1.0,
      // OUT-01 / D-1: stone passes render with a transparent film so the holdout layer
      // carries real alpha; metal/full passes stay opaque. NOTE: the metal pass stays an
      // opaque PNG here — emitting a literal JPEG would require a worker change and is
      // explicitly DEFERRED. Forward-correct: this only affects NEW batches; existing
      // Job.recipe rows were already generated and are unchanged.
      transparent: request.pass === "stone"
    },
    camera: angle.camera,
    world: { color: [1.0, 1.0, 1.0], strength: KNOB_DEFAULTS.worldStrength }, // 0.105
    background: {
      color: [0.965, 0.965, 0.955, 1.0],
      plane_size: 8.5,
      plane_z: -0.055,
      // Catalog sweep (live-render fix): auto_orient + auto_frame made every
      // camera view the floor at a grazing angle — the whole frame background
      // WAS the floor (soft-shadow wedge + area-light pools). The worker adds a
      // big camera-only EMISSION plane behind the product (zero light
      // contribution); only `enabled` is emitted — worker defaults govern
      // distance/size/color/strength. Emitted on ALL passes; on stone passes
      // the worker extends visible_camera:false below to the backdrop too.
      backdrop: { enabled: true },
      // Stone passes only (live E2E fix): the floor plane LIGHTS the stones
      // (diffuse/glossy/transmission bounce preserved by the worker) but is
      // invisible to camera, so the layer is pure stones-on-alpha for
      // compositing — it rendered as opaque floor pixels before. The worker
      // also camera-hides the contact-shadow discs when this flag is false.
      // Metal/full passes omit the key entirely (floor stays visible).
      ...(request.pass === "stone" ? { visible_camera: false } : {})
    },
    model: {
      // Legacy "stand upright + orient head" normalization (worker
      // auto_orient_model): uploaded models often import lying flat — the worker
      // rotates the thinnest bbox axis (band depth) to Y, then spins the head
      // (stones/setting) to +Z, BEFORE auto_center/auto_scale/ground_to_plane.
      // Emitted on ALL passes (full/metal/stone): pass visibility is applied
      // after transforms, so every layer shares the same full-product
      // orientation basis and stays aligned for compositing. Already-upright
      // models (ring99-style, Y thinnest) hit the identity branch — safe.
      auto_orient: true,
      auto_center: true,
      auto_scale: true,
      target_size: angle.targetSize,
      rotation_degrees: angle.rotation,
      translation: [0, 0, 0],
      ground_to_plane: true,
      ground_clearance: 0.022,
      shade_smooth: true,
      shade_smooth_exclude_contains: ["diamond", "stone", "gem", "round", "brilliant", "zirconia"],
      include_contains: [] as string[],
      exclude_contains: uniqueTokens(["light", "camera", "cube", "helper", "swatch", "plane"]),
      // Emitted only on metal/stone passes — the full pass carries neither field,
      // so its JSON (and the golden sha256) is unchanged.
      ...(visibility.hide.length ? { pass_hide_contains: visibility.hide } : {}),
      ...(visibility.holdout.length ? { pass_holdout_contains: visibility.holdout } : {})
    },
    material_strategy: "override",
    material_map: materialMap,
    materials: {
      selected_metal: {
        type: "metal",
        base_color: metal.base,
        metallic: 1.0,
        roughness: metal.roughness,
        specular_ior_level: 0.72
      },
      stone_diamond: STONE_PRESETS.diamond,
      stone_sapphire: STONE_PRESETS.sapphire,
      stone_emerald: STONE_PRESETS.emerald,
      stone_ruby: STONE_PRESETS.ruby
    },
    lights: [
      {
        name: "large_top_softbox",
        type: "AREA",
        position: [0.0, -1.85, 3.25],
        rotation_degrees: [62, 0, 0],
        size: 3.6,
        power: 360
      },
      {
        name: "left_long_strip",
        type: "AREA",
        position: [-2.65, -2.25, 1.25],
        rotation_degrees: [71, 0, -36],
        size: 1.25,
        power: 88
      },
      {
        name: "right_soft_strip",
        type: "AREA",
        position: [2.45, -1.8, 1.35],
        rotation_degrees: [70, 0, 42],
        size: 1.1,
        power: 68
      },
      {
        name: "diamond_pin_left",
        type: "POINT",
        position: [-0.62, -1.18, 1.42],
        power: 32,
        shadow_soft_size: 0.014
      },
      {
        name: "diamond_pin_right",
        type: "POINT",
        position: [0.78, -1.28, 1.72],
        power: 24,
        shadow_soft_size: 0.012
      }
    ],
    reflection_cards: [
      {
        name: "left_dark_facet_card",
        position: [-1.75, -0.92, 1.55],
        rotation_degrees: [58, 0, -44],
        size: [1.25, 1.05],
        color: [0.015, 0.015, 0.018, 1],
        visible_to_camera: false
      },
      {
        name: "right_soft_metal_lift",
        position: [2.15, -1.15, 1.25],
        rotation_degrees: [64, 0, 50],
        size: [1.55, 1.0],
        color: [0.38, 0.38, 0.383, 1],
        visible_to_camera: false
      },
      {
        name: "top_narrow_dark_facet",
        position: [-0.1, -0.42, 2.42],
        rotation_degrees: [8, 0, -8],
        size: [1.8, 0.55],
        color: [0.025, 0.025, 0.028, 1],
        visible_to_camera: false
      },
      {
        name: "low_front_metal_band",
        position: [0.0, -2.55, 0.35],
        rotation_degrees: [73, 0, 0],
        size: [3.7, 0.62],
        color: [0.055, 0.055, 0.06, 1],
        visible_to_camera: false
      },
      // Upright-pose rim cards (live E2E fix): after normalization every
      // product occupies the same envelope (max-dim ~2.05, grounded at the
      // origin), so static cards serve all products. The original card set was
      // placed for low/flat poses — an upright ring's CROWN (z≈1.4–2.1) had no
      // dark reflector nearby, so its polished white metal rendered
      // contrast-less against the white backdrop and the upper half visually
      // vanished (codex lesson: dark cards create readable metal edges).
      {
        name: "crown_dark_rim_card",
        position: [0.0, 0.9, 3.1],
        rotation_degrees: [-38, 0, 0],
        size: [4.2, 1.6],
        color: [0.03, 0.03, 0.035, 1],
        visible_to_camera: false
      },
      {
        name: "left_rim_contrast",
        position: [-2.3, 0.2, 1.7],
        rotation_degrees: [0, 62, 0],
        size: [1.1, 2.6],
        color: [0.05, 0.05, 0.055, 1],
        visible_to_camera: false
      },
      {
        name: "right_rim_contrast",
        position: [2.3, 0.2, 1.7],
        rotation_degrees: [0, -62, 0],
        size: [1.1, 2.6],
        color: [0.05, 0.05, 0.055, 1],
        visible_to_camera: false
      }
    ],
    contact_shadows: [
      {
        layers: 4,
        alpha: KNOB_DEFAULTS.contactShadowStrength, // 0.115 — INTEL-01 identity baseline
        position: [0, 0, -0.052],
        size: [2.4, 0.5],
        color: [0.08, 0.08, 0.08],
        blur: 2.0
      }
    ],
    // PASS-SCOPED POSTPROCESS (render-quality regression fix): the enhancement
    // stages below carry fallback_bounds_norm rectangles — when their
    // object_contains tokens miss (or the target is held out), they fall back to
    // PAINTING SYNTHETIC CONTENT into that fixed rectangle. On a transparent
    // stone-holdout layer this drew a giant fake 24-facet disk over the alpha
    // (diamond_facets/center_stone on the stone pass). Contract:
    //   - full  -> ALL enhancement stages ON (the catalog beauty render).
    //   - metal -> product enhancement only; every stone-specific stage OFF
    //              (center_stone / center_stone_symmetry / diamond_facets).
    //   - stone -> EVERY stage that can paint over alpha OFF (product included);
    //              the transparent holdout layer ships raw for compositing.
    // The full-pass values are byte-identical to the classic recipe (golden
    // sha256 in test/intel-overrides.test.ts unchanged).
    postprocess: {
      studio_background: {
        // DISABLED for ALL passes (live E2E root-cause): the painted sweep
        // ERASES real product pixels — its protect mask is hard-gated by
        // object_image_bounds, and the frustum guard rightly omits borderline
        // objects, so the ring's upper half was painted over. The in-render
        // background is now clipped TRUE WHITE (Light Path floor sweep +
        // camera-only backdrop, worker r4+), making the 2D repaint redundant.
        enabled: false,
        // WHITE-SWEEP CALIBRATION (worker build r4+): the Light Path floor/
        // backdrop now renders clipped TRUE WHITE to camera. The painted sweep
        // must sit just under that raw white — the previous darker greys made
        // the protected product rectangles show as WHITE patches against a
        // grey painted sweep (polarity-flipped seams). Near-white + subtle
        // vignette keeps the paint invisible against the raw render.
        // Recipe-level only: postprocess.py defaults stay for legacy recipes.
        top_color: [253, 253, 252],
        floor_color: [249, 249, 247],
        floor_start: 0.54,
        floor_strength: 0.82,
        vignette: 4,
        bright_object_keep: 0.38,
        shadows: [{ cx: 0.5, cy: 0.78, rx: 0.36, ry: 0.045, alpha: 26, color: [56, 58, 60] }],
        shadow_blur: 30
      },
      product: {
        enabled: request.pass !== "stone",
        padding_px: 12,
        contrast: 1.045,
        brightness: 0.985,
        saturation: 0.96,
        sharpness: 1.08,
        unsharp_percent: 42,
        blend: 0.28,
        mask_feather: 38
      },
      center_stone: {
        enabled: request.pass === "full",
        object_contains: centerTokens,
        // NO fallback_bounds_norm (live E2E fix): when the stone bounds don't
        // match (tiny/edge stones get omitted by the worker's frustum guard),
        // the stage must SKIP — with the fallback ellipse it tinted a giant
        // amber blob onto the clean white background of stone-less framings.
        padding_px: 12,
        autocontrast_cutoff: 0.5,
        contrast: 1.12,
        brightness: 0.965,
        saturation: 0.92,
        sharpness: 1.22,
        unsharp_radius: 0.9,
        unsharp_percent: 88,
        detail_amount: 0.25,
        blend: 0.5,
        mask_feather: 12
      },
      center_stone_symmetry: {
        enabled: request.pass === "full",
        object_contains: centerTokens,
        // NO fallback_bounds_norm — skip on no-match (see center_stone note;
        // the symmetry blend painted the lavender band across the fallback ellipse).
        padding_px: 22,
        mask_feather: 10,
        max_delta: 30,
        blend: 0.34
      },
      diamond_facets: {
        enabled: request.pass === "full",
        object_contains: centerTokens,
        // PAINT stage (live E2E fix): when object-token matching misses, NEVER
        // paint the synthetic facet wheel into the fallback rectangle — skip
        // the stage. The worker also gates a matched region at max_bounds_frac
        // (default 0.25 of frame area) so an unreliable too-large match (token
        // hit a band/cluster object) can never get a wheel painted across it.
        // Emitted for ALL passes so the recipe stays the quality source; the
        // tuned ring99 look is untouched when bounds DO match confidently.
        fallback: "skip",
        facets: 24,
        dark_alpha: 0.13,
        light_alpha: 0.09,
        chroma_alpha: 0.055,
        line_alpha: 0.08,
        blend: 0.2,
        mask_feather: 11
      }
    }
  };

  // ── INTEL-01: apply clamped profileOverrides at the END of assembly (G2). ──
  // Each present knob moves exactly one recipe surface, saturated to KNOB_RANGES
  // before it touches the recipe — a hallucinated out-of-range value can never
  // reach Blender. Absent knobs leave the identity values above untouched, so the
  // no-override path is byte-identical to the pre-override generator (asserted by
  // golden sha256 in test/intel-overrides.test.ts). Mutation (not respread) keeps
  // JSON key order — and therefore JSON.stringify bytes — stable.
  if (overrides) {
    if (overrides.worldStrength !== undefined) {
      recipe.world.strength = clamp(overrides.worldStrength, KNOB_RANGES.worldStrength);
    }
    if (overrides.exposure !== undefined) {
      recipe.render.exposure = clamp(overrides.exposure, KNOB_RANGES.exposure);
    }
    if (overrides.contactShadowStrength !== undefined) {
      const alpha = clamp(
        overrides.contactShadowStrength,
        KNOB_RANGES.contactShadowStrength
      );
      for (const shadow of recipe.contact_shadows) {
        shadow.alpha = alpha;
      }
    }
    if (overrides.cardDarkness !== undefined) {
      // CARD-DARKNESS IDENTITY BASELINE = KNOB_DEFAULTS.cardDarkness (1.0): the
      // knob is a direct multiplier on today's card RGB, so ABSENCE reproduces
      // today's colors verbatim. An explicit value is clamped to the SAFE
      // [0, 0.5] band (always darker than today; 0 = pure black) — LOWER =
      // darker cards = readable facets, the DOMAIN-sanctioned direction.
      const factor = clamp(overrides.cardDarkness, KNOB_RANGES.cardDarkness);
      for (const card of recipe.reflection_cards) {
        card.color = card.color.map((channel, i) => (i < 3 ? channel * factor : channel));
      }
    }
  }

  return recipe;
}

export const enterpriseAngles = ANGLES;
export const enterpriseMetalLabels = Object.fromEntries(
  Object.entries(METAL_PRESETS).map(([key, value]) => [key, value.label])
) as Record<EnterpriseMetal, string>;

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

const ANGLES: Record<
  EnterpriseAngleKey,
  {
    label: string;
    camera: { position: number[]; target: number[]; focal_length: number; depth_of_field: Record<string, unknown> };
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

function buildVisibility(request: EnterpriseRecipeRequest) {
  const metalTokens = tokensFor(request.groupTokens, "alloycolour");
  const stoneTokens = [
    ...tokensFor(request.groupTokens, "diamond"),
    ...tokensFor(request.groupTokens, "stone2"),
    ...tokensFor(request.groupTokens, "stone3")
  ];

  if (request.pass === "metal") {
    return { include: uniqueTokens(metalTokens), exclude: uniqueTokens(stoneTokens) };
  }

  if (request.pass === "stone" && request.stoneGroup) {
    return {
      include: uniqueTokens([...metalTokens, ...tokensFor(request.groupTokens, request.stoneGroup)]),
      exclude: []
    };
  }

  return { include: [], exclude: [] };
}

export function buildEnterpriseRecipe(request: EnterpriseRecipeRequest): Record<string, unknown> {
  const angle = ANGLES[request.angle];
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

  return {
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
      exposure: -0.58,
      gamma: 1.0,
      transparent: false
    },
    camera: angle.camera,
    world: { color: [1.0, 1.0, 1.0], strength: 0.105 },
    background: { color: [0.965, 0.965, 0.955, 1.0], plane_size: 8.5, plane_z: -0.055 },
    model: {
      auto_center: true,
      auto_scale: true,
      target_size: angle.targetSize,
      rotation_degrees: angle.rotation,
      translation: [0, 0, 0],
      ground_to_plane: true,
      ground_clearance: 0.022,
      shade_smooth: true,
      shade_smooth_exclude_contains: ["diamond", "stone", "gem", "round", "brilliant", "zirconia"],
      include_contains: visibility.include,
      exclude_contains: uniqueTokens(["light", "camera", "cube", "helper", "swatch", "plane", ...visibility.exclude])
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
      }
    ],
    contact_shadows: [
      {
        layers: 4,
        alpha: 0.115,
        position: [0, 0, -0.052],
        size: [2.4, 0.5],
        color: [0.08, 0.08, 0.08],
        blur: 2.0
      }
    ],
    postprocess: {
      studio_background: {
        enabled: true,
        top_color: [247, 247, 246],
        floor_color: [237, 237, 235],
        floor_start: 0.54,
        floor_strength: 0.82,
        vignette: 5.5,
        bright_object_keep: 0.38,
        shadows: [{ cx: 0.5, cy: 0.78, rx: 0.36, ry: 0.045, alpha: 26, color: [56, 58, 60] }],
        shadow_blur: 30
      },
      product: {
        enabled: true,
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
        enabled: true,
        object_contains: centerTokens,
        fallback_bounds_norm: [0.37, 0.32, 0.63, 0.66],
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
        enabled: true,
        object_contains: centerTokens,
        fallback_bounds_norm: [0.37, 0.32, 0.63, 0.66],
        padding_px: 22,
        mask_feather: 10,
        max_delta: 30,
        blend: 0.34
      },
      diamond_facets: {
        enabled: request.pass !== "metal",
        object_contains: centerTokens,
        fallback_bounds_norm: [0.38, 0.33, 0.62, 0.65],
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
}

export const enterpriseAngles = ANGLES;
export const enterpriseMetalLabels = Object.fromEntries(
  Object.entries(METAL_PRESETS).map(([key, value]) => [key, value.label])
) as Record<EnterpriseMetal, string>;

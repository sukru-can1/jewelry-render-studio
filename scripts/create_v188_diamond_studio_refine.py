from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v187c_research_catalog_ring_circle.json"


PRODUCT_TOKENS = [
    "Diamond_Round",
    "Prong",
    "MASTER_SCENE_realistic_polished_gold",
    "Shiny Gold",
]


ANGLE_CATALOG = {
    "rotation_degrees": [0, 0, -32],
    "scale": 0.88,
    "translation": [0.0, 0.0, -0.01],
}

ANGLE_UPPER_LEFT = {
    "rotation_degrees": [0, 0, 34],
    "scale": 0.90,
    "translation": [-0.015, 0.0, 0.0],
}


def update_gold(recipe: dict, base_color: list[float], roughness: float, specular: float) -> None:
    for material in recipe.get("material_map", []):
        contains = material.get("contains", [])
        if any(token in contains for token in ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"]):
            adjust = material.setdefault("source_material_adjust", {})
            adjust["base_color"] = base_color
            adjust["diffuse_color"] = base_color
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular


def update_center_stone(recipe: dict, value_scale: float, value_max: float, saturation: float) -> None:
    for material in recipe.get("material_map", []):
        if "Diamond_Round_11" in material.get("contains", []):
            adjust = material.setdefault("source_material_adjust", {})
            adjust["hsv_value_scale"] = value_scale
            adjust["hsv_value_max"] = value_max
            adjust["saturation_scale"] = saturation


def set_studio(recipe: dict, angle: dict, front: float, fill: float, top: float, sparkle: float, dark: float, gray: float) -> None:
    recipe["source_scene"]["light_adjustments"] = [
        {"contains": ["large_front_left_softbox"], "power_scale": front},
        {"contains": ["weak_front_right_fill"], "power_scale": fill},
        {"contains": ["low_top_softbox"], "power_scale": top},
        {
            "contains": ["diamond_micro_sparkle"],
            "power_scale": sparkle,
            "color": [0.94, 0.98, 1.0],
        },
    ]
    recipe["source_scene"]["object_adjustments"] = [
        {
            "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
            "source_material_adjust": {
                "base_color": [dark, dark, dark + 0.003, 1.0],
                "diffuse_color": [dark, dark, dark + 0.003, 1.0],
                "emission_color": [dark, dark, dark + 0.003, 1.0],
                "emission_strength_scale": 0.66,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.012, 1.0],
                "diffuse_color": [gray, gray, gray + 0.012, 1.0],
                "emission_color": [gray, gray, gray + 0.012, 1.0],
                "emission_strength_scale": 0.82,
            },
        },
    ]
    recipe["source_scene"]["group_adjustments"] = [
        {
            "contains": PRODUCT_TOKENS,
            "rotation_degrees": angle["rotation_degrees"],
            "scale": angle["scale"],
            "translation": angle["translation"],
        }
    ]


def configure_center_post(recipe: dict, contrast: float, brightness: float, detail: float, blend: float) -> None:
    center = recipe["postprocess"]["center_stone"]
    center.update(
        {
            "enabled": True,
            "object_contains": ["Diamond_Round_11"],
            "fallback_bounds_norm": [0.34, 0.18, 0.66, 0.52],
            "padding_px": 28,
            "contrast": contrast,
            "brightness": brightness,
            "sharpness": 1.30,
            "unsharp_radius": 0.9,
            "unsharp_percent": 135,
            "unsharp_threshold": 1,
            "detail_amount": detail,
            "detail_radius": 3.2,
            "blend": blend,
            "mask_feather": 12,
            "autocontrast_cutoff": 0.65,
            "saturation": 0.90,
        }
    )


VARIANTS = [
    {
        "name": "v188a_catalog_deeper_facets_clean_metal",
        "angle": ANGLE_CATALOG,
        "studio": (0.80, 0.42, 0.64, 1.95, 0.015, 0.22),
        "exposure": -0.90,
        "gold": ([0.315, 0.333, 0.365, 1.0], 0.30, 0.42),
        "stone": (0.56, 0.88, 0.90),
        "post": (1.64, 0.91, 0.24, 0.58),
    },
    {
        "name": "v188b_catalog_mild_facet_overlay",
        "angle": ANGLE_CATALOG,
        "studio": (0.80, 0.42, 0.64, 1.95, 0.015, 0.22),
        "exposure": -0.90,
        "gold": ([0.315, 0.333, 0.365, 1.0], 0.30, 0.42),
        "stone": (0.56, 0.88, 0.90),
        "post": (1.52, 0.92, 0.18, 0.46),
        "facets": {
            "enabled": True,
            "object_contains": ["Diamond_Round_11"],
            "padding_px": 18,
            "fallback_bounds_norm": [0.37, 0.23, 0.63, 0.50],
            "facets": 32,
            "inner_ratio": 0.20,
            "dark_alpha": 0.12,
            "light_alpha": 0.07,
            "chroma_alpha": 0.025,
            "line_alpha": 0.05,
            "table_radius": 0.15,
            "mask_feather": 16,
        },
    },
    {
        "name": "v188c_upper_left_crisper_diamond",
        "angle": ANGLE_UPPER_LEFT,
        "studio": (0.76, 0.46, 0.66, 1.85, 0.016, 0.24),
        "exposure": -0.88,
        "gold": ([0.31, 0.328, 0.36, 1.0], 0.30, 0.42),
        "stone": (0.57, 0.89, 0.90),
        "post": (1.58, 0.92, 0.22, 0.56),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v188 diamond/studio refinement from v187c: deeper facets, controlled metal reflection, optional mild facet overlay."
        recipe["render"]["samples"] = 760
        recipe["render"]["exposure"] = variant["exposure"]
        set_studio(recipe, variant["angle"], *variant["studio"])
        update_gold(recipe, *variant["gold"])
        update_center_stone(recipe, *variant["stone"])
        configure_center_post(recipe, *variant["post"])
        recipe["postprocess"].pop("diamond_facets", None)
        if "facets" in variant:
            recipe["postprocess"]["diamond_facets"] = variant["facets"]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

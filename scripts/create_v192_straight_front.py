from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v190b_brighter_chrome_deep_stone.json"


PRODUCT_TOKENS = [
    "Diamond_Round",
    "Prong",
    "MASTER_SCENE_realistic_polished_gold",
    "Shiny Gold",
]


def set_group(recipe: dict, rotation: list[float], scale: float, translation: list[float] | None = None) -> None:
    recipe["source_scene"].pop("camera_orbit", None)
    recipe["source_scene"]["group_adjustments"] = [
        {
            "contains": PRODUCT_TOKENS,
            "rotation_degrees": rotation,
            "scale": scale,
            "translation": translation or [0.0, 0.0, -0.01],
        }
    ]


def set_lights(recipe: dict, front: float, fill: float, top: float, sparkle: float, dark: float, gray: float) -> None:
    recipe["source_scene"]["light_adjustments"] = [
        {"contains": ["large_front_left_softbox"], "power_scale": front},
        {"contains": ["weak_front_right_fill"], "power_scale": fill},
        {"contains": ["low_top_softbox"], "power_scale": top},
        {"contains": ["diamond_micro_sparkle"], "power_scale": sparkle, "color": [0.93, 0.975, 1.0]},
    ]
    recipe["source_scene"]["object_adjustments"] = [
        {
            "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
            "source_material_adjust": {
                "base_color": [dark, dark, dark + 0.003, 1.0],
                "diffuse_color": [dark, dark, dark + 0.003, 1.0],
                "emission_color": [dark, dark, dark + 0.003, 1.0],
                "emission_strength_scale": 0.58,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.014, 1.0],
                "diffuse_color": [gray, gray, gray + 0.014, 1.0],
                "emission_color": [gray, gray, gray + 0.014, 1.0],
                "emission_strength_scale": 0.84,
            },
        },
    ]


def tune_materials(recipe: dict, gold: list[float], roughness: float, stone_value: float, stone_max: float) -> None:
    for material in recipe.get("material_map", []):
        contains = material.get("contains", [])
        adjust = material.setdefault("source_material_adjust", {})
        if any(token in contains for token in ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"]):
            adjust["base_color"] = gold
            adjust["diffuse_color"] = gold
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = 0.40
        elif "Diamond_Round_11" in contains:
            adjust["hsv_value_scale"] = stone_value
            adjust["hsv_value_max"] = stone_max
            adjust["saturation_scale"] = 0.94
            adjust["glass_color_mix"] = 0.045
            adjust["diffuse_color"] = [0.52, 0.56, 0.64, 1.0]


def tune_post(recipe: dict, contrast: float, brightness: float, detail: float, blend: float, cutoff: float) -> None:
    center = recipe["postprocess"]["center_stone"]
    center.update(
        {
            "object_contains": ["Diamond_Round_11"],
            "fallback_bounds_norm": [0.33, 0.22, 0.67, 0.58],
            "contrast": contrast,
            "brightness": brightness,
            "sharpness": 1.34,
            "unsharp_radius": 0.82,
            "unsharp_percent": 150,
            "unsharp_threshold": 1,
            "detail_amount": detail,
            "detail_radius": 2.8,
            "blend": blend,
            "autocontrast_cutoff": cutoff,
            "saturation": 0.92,
            "mask_feather": 11,
            "padding_px": 28,
        }
    )
    recipe["postprocess"].pop("studio_background", None)
    recipe["postprocess"].pop("diamond_facets", None)


VARIANTS = [
    {
        "name": "v192a_straight_front_deep_diamond",
        "rotation": [-22, 0, -18],
        "scale": 0.92,
        "lights": (0.92, 0.36, 0.54, 2.08, 0.010, 0.30),
        "exposure": -0.96,
        "gold": ([0.36, 0.378, 0.408, 1.0], 0.275),
        "stone": (0.50, 0.84),
        "post": (1.78, 0.91, 0.30, 0.58, 0.76),
    },
    {
        "name": "v192b_straight_front_clean_metal",
        "rotation": [-22, 0, -18],
        "scale": 0.92,
        "lights": (0.96, 0.42, 0.60, 1.95, 0.012, 0.34),
        "exposure": -0.93,
        "gold": ([0.372, 0.392, 0.424, 1.0], 0.29),
        "stone": (0.53, 0.86),
        "post": (1.68, 0.92, 0.25, 0.54, 0.70),
    },
    {
        "name": "v192c_straight_front_larger_catalog",
        "rotation": [-23, 0, -15],
        "scale": 0.98,
        "lights": (0.94, 0.38, 0.56, 2.06, 0.011, 0.32),
        "exposure": -0.95,
        "gold": ([0.365, 0.384, 0.416, 1.0], 0.285),
        "stone": (0.51, 0.85),
        "post": (1.74, 0.915, 0.28, 0.56, 0.74),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v192 straight-front render: front-facing halo, horizontal band, current best diamond/metal studio."
        recipe["render"]["samples"] = 820
        recipe["render"]["exposure"] = variant["exposure"]
        set_group(recipe, variant["rotation"], variant["scale"])
        set_lights(recipe, *variant["lights"])
        tune_materials(recipe, gold=variant["gold"][0], roughness=variant["gold"][1], stone_value=variant["stone"][0], stone_max=variant["stone"][1])
        tune_post(recipe, *variant["post"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

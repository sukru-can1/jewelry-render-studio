from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v188a_catalog_deeper_facets_clean_metal.json"


PRODUCT_TOKENS = [
    "Diamond_Round",
    "Prong",
    "MASTER_SCENE_realistic_polished_gold",
    "Shiny Gold",
]


def set_group(recipe: dict, rotation: list[float], scale: float) -> None:
    recipe["source_scene"].pop("camera_orbit", None)
    recipe["source_scene"]["group_adjustments"] = [
        {
            "contains": PRODUCT_TOKENS,
            "rotation_degrees": rotation,
            "scale": scale,
            "translation": [0.0, 0.0, -0.01],
        }
    ]


def set_lights(recipe: dict, front: float, fill: float, top: float, sparkle: float) -> None:
    recipe["source_scene"]["light_adjustments"] = [
        {"contains": ["large_front_left_softbox"], "power_scale": front},
        {"contains": ["weak_front_right_fill"], "power_scale": fill},
        {"contains": ["low_top_softbox"], "power_scale": top},
        {
            "contains": ["diamond_micro_sparkle"],
            "power_scale": sparkle,
            "color": [0.93, 0.975, 1.0],
        },
    ]


def set_cards(recipe: dict, dark: float, gray: float, dark_strength: float = 0.62, gray_strength: float = 0.78) -> None:
    recipe["source_scene"]["object_adjustments"] = [
        {
            "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
            "source_material_adjust": {
                "base_color": [dark, dark, dark + 0.003, 1.0],
                "diffuse_color": [dark, dark, dark + 0.003, 1.0],
                "emission_color": [dark, dark, dark + 0.003, 1.0],
                "emission_strength_scale": dark_strength,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.014, 1.0],
                "diffuse_color": [gray, gray, gray + 0.014, 1.0],
                "emission_color": [gray, gray, gray + 0.014, 1.0],
                "emission_strength_scale": gray_strength,
            },
        },
    ]


def set_materials(recipe: dict, gold_color: list[float], gold_roughness: float, stone_value: float, stone_max: float, stone_sat: float) -> None:
    for material in recipe.get("material_map", []):
        contains = material.get("contains", [])
        adjust = material.setdefault("source_material_adjust", {})
        if any(token in contains for token in ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"]):
            adjust["base_color"] = gold_color
            adjust["diffuse_color"] = gold_color
            adjust["roughness"] = gold_roughness
            adjust["specular_ior_level"] = 0.40
        elif "Diamond_Round_11" in contains:
            adjust["hsv_value_scale"] = stone_value
            adjust["hsv_value_max"] = stone_max
            adjust["saturation_scale"] = stone_sat
            adjust["glass_color_mix"] = 0.045
            adjust["diffuse_color"] = [0.52, 0.56, 0.64, 1.0]


def set_post(recipe: dict, contrast: float, brightness: float, detail: float, blend: float, cutoff: float) -> None:
    center = recipe["postprocess"]["center_stone"]
    center.update(
        {
            "object_contains": ["Diamond_Round_11"],
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
    recipe["postprocess"].pop("diamond_facets", None)


VARIANTS = [
    {
        "name": "v190a_v189_sparkle_v188_framing",
        "rotation": [0, 0, -32],
        "scale": 0.90,
        "lights": (0.86, 0.34, 0.56, 2.18),
        "cards": (0.011, 0.25, 0.62, 0.78),
        "exposure": -0.94,
        "gold": ([0.335, 0.352, 0.382, 1.0], 0.285),
        "stone": (0.52, 0.86, 0.93),
        "post": (1.72, 0.905, 0.28, 0.60, 0.72),
    },
    {
        "name": "v190b_brighter_chrome_deep_stone",
        "rotation": [0, 0, -31],
        "scale": 0.91,
        "lights": (0.92, 0.36, 0.54, 2.05),
        "cards": (0.010, 0.30, 0.58, 0.84),
        "exposure": -0.96,
        "gold": ([0.36, 0.378, 0.408, 1.0], 0.275),
        "stone": (0.50, 0.84, 0.94),
        "post": (1.78, 0.91, 0.30, 0.58, 0.76),
    },
    {
        "name": "v190c_cleaner_white_fire",
        "rotation": [0, 0, -33],
        "scale": 0.90,
        "lights": (0.88, 0.40, 0.66, 2.30),
        "cards": (0.014, 0.27, 0.62, 0.80),
        "exposure": -0.92,
        "gold": ([0.34, 0.358, 0.39, 1.0], 0.295),
        "stone": (0.56, 0.88, 0.98),
        "post": (1.62, 0.93, 0.22, 0.54, 0.66),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v190 scene-only refinement: v188 framing with v189 sparkle/contrast ideas, no source camera orbit."
        recipe["render"]["samples"] = 800
        recipe["render"]["exposure"] = variant["exposure"]
        set_group(recipe, variant["rotation"], variant["scale"])
        set_lights(recipe, *variant["lights"])
        set_cards(recipe, *variant["cards"])
        set_materials(recipe, gold_color=variant["gold"][0], gold_roughness=variant["gold"][1], stone_value=variant["stone"][0], stone_max=variant["stone"][1], stone_sat=variant["stone"][2])
        set_post(recipe, *variant["post"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

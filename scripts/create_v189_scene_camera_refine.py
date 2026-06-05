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


CATALOG = {
    "rotation_degrees": [0, 0, -32],
    "scale": 0.88,
    "translation": [0.0, 0.0, -0.01],
}

CATALOG_OPEN = {
    "rotation_degrees": [-3, 0, -28],
    "scale": 0.88,
    "translation": [0.0, 0.0, -0.01],
}

UPPER_LEFT = {
    "rotation_degrees": [0, 0, 34],
    "scale": 0.90,
    "translation": [-0.015, 0.0, 0.0],
}


def material_adjust(recipe: dict, *, gold_color: list[float], gold_roughness: float, stone_value: float, stone_max: float) -> None:
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
            adjust["saturation_scale"] = 0.93
            adjust["glass_color_mix"] = 0.045
            adjust["diffuse_color"] = [0.52, 0.56, 0.64, 1.0]


def set_scene(recipe: dict, *, angle: dict, front: float, fill: float, top: float, sparkle: float, dark: float, gray: float) -> None:
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
    recipe["source_scene"]["object_adjustments"] = [
        {
            "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
            "source_material_adjust": {
                "base_color": [dark, dark, dark + 0.003, 1.0],
                "diffuse_color": [dark, dark, dark + 0.003, 1.0],
                "emission_color": [dark, dark, dark + 0.003, 1.0],
                "emission_strength_scale": 0.62,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.014, 1.0],
                "diffuse_color": [gray, gray, gray + 0.014, 1.0],
                "emission_color": [gray, gray, gray + 0.014, 1.0],
                "emission_strength_scale": 0.78,
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


def set_post(recipe: dict, contrast: float, brightness: float, detail: float, blend: float) -> None:
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
            "autocontrast_cutoff": 0.72,
            "saturation": 0.92,
            "mask_feather": 11,
            "padding_px": 28,
        }
    )
    recipe["postprocess"].pop("diamond_facets", None)


VARIANTS = [
    {
        "name": "v189a_lower_camera_deeper_table",
        "angle": CATALOG,
        "camera": {"enabled": True, "height_scale": 0.82, "distance_scale": 1.02, "target_offset": [0.0, 0.0, -0.01], "focal_length": 74},
        "lights": (0.86, 0.34, 0.56, 2.18, 0.011, 0.25),
        "exposure": -0.94,
        "gold": ([0.335, 0.352, 0.382, 1.0], 0.285),
        "stone": (0.52, 0.86),
        "post": (1.72, 0.905, 0.28, 0.60),
    },
    {
        "name": "v189b_open_angle_clean_chrome",
        "angle": CATALOG_OPEN,
        "camera": {"enabled": True, "height_scale": 0.88, "distance_scale": 1.04, "target_offset": [0.0, 0.0, -0.006], "focal_length": 72},
        "lights": (0.88, 0.38, 0.60, 2.05, 0.013, 0.28),
        "exposure": -0.92,
        "gold": ([0.34, 0.358, 0.39, 1.0], 0.30),
        "stone": (0.54, 0.87),
        "post": (1.66, 0.91, 0.25, 0.58),
    },
    {
        "name": "v189c_upper_left_less_wash",
        "angle": UPPER_LEFT,
        "camera": {"enabled": True, "height_scale": 0.86, "distance_scale": 1.08, "target_offset": [0.0, 0.0, -0.004], "focal_length": 70},
        "lights": (0.82, 0.40, 0.58, 2.02, 0.012, 0.27),
        "exposure": -0.91,
        "gold": ([0.33, 0.348, 0.38, 1.0], 0.30),
        "stone": (0.53, 0.87),
        "post": (1.68, 0.91, 0.26, 0.58),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v189 scene/camera refinement from v188a: lower camera tests, less fill wash, deeper diamond table contrast."
        recipe["render"]["samples"] = 780
        recipe["render"]["exposure"] = variant["exposure"]
        recipe["source_scene"]["camera_orbit"] = variant["camera"]
        set_scene(recipe, angle=variant["angle"], front=variant["lights"][0], fill=variant["lights"][1], top=variant["lights"][2], sparkle=variant["lights"][3], dark=variant["lights"][4], gray=variant["lights"][5])
        material_adjust(recipe, gold_color=variant["gold"][0], gold_roughness=variant["gold"][1], stone_value=variant["stone"][0], stone_max=variant["stone"][1])
        set_post(recipe, *variant["post"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v192b_straight_front_clean_metal.json"


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
                "emission_strength_scale": 0.54,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.014, 1.0],
                "diffuse_color": [gray, gray, gray + 0.014, 1.0],
                "emission_color": [gray, gray, gray + 0.014, 1.0],
                "emission_strength_scale": 0.88,
            },
        },
    ]


def tune_center(recipe: dict, contrast: float, brightness: float, detail: float, blend: float, cutoff: float) -> None:
    center = recipe["postprocess"]["center_stone"]
    center.update(
        {
            "contrast": contrast,
            "brightness": brightness,
            "sharpness": 1.30,
            "unsharp_radius": 0.86,
            "unsharp_percent": 138,
            "unsharp_threshold": 1,
            "detail_amount": detail,
            "blend": blend,
            "autocontrast_cutoff": cutoff,
            "saturation": 0.90,
            "mask_feather": 12,
        }
    )


VARIANTS = [
    {
        "name": "v193a_front_depth_oval_band",
        "rotation": [-16, 0, -16],
        "scale": 0.95,
        "exposure": -0.92,
        "lights": (0.98, 0.46, 0.62, 1.92, 0.012, 0.36),
        "post": (1.66, 0.925, 0.24, 0.52, 0.68),
    },
    {
        "name": "v193b_front_depth_balanced",
        "rotation": [-18, 0, -14],
        "scale": 0.96,
        "exposure": -0.93,
        "lights": (0.96, 0.42, 0.60, 2.00, 0.011, 0.34),
        "post": (1.70, 0.918, 0.26, 0.54, 0.70),
    },
    {
        "name": "v193c_front_depth_large_clean",
        "rotation": [-14, 0, -14],
        "scale": 0.98,
        "exposure": -0.91,
        "lights": (1.00, 0.48, 0.66, 1.88, 0.013, 0.38),
        "post": (1.60, 0.935, 0.22, 0.50, 0.64),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v193 straight-front refinement: keep front-facing diamond, add visible band depth and softer shadow."
        recipe["render"]["samples"] = 820
        recipe["render"]["exposure"] = variant["exposure"]
        set_group(recipe, variant["rotation"], variant["scale"])
        set_lights(recipe, *variant["lights"])
        tune_center(recipe, *variant["post"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

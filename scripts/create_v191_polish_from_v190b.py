from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v190b_brighter_chrome_deep_stone.json"


def tune_lights(recipe: dict, front: float, fill: float, top: float, sparkle: float, dark: float, gray: float) -> None:
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
                "emission_strength_scale": 0.56,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.014, 1.0],
                "diffuse_color": [gray, gray, gray + 0.014, 1.0],
                "emission_color": [gray, gray, gray + 0.014, 1.0],
                "emission_strength_scale": 0.86,
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
            "detail_radius": 3.0,
            "blend": blend,
            "autocontrast_cutoff": cutoff,
            "saturation": 0.90,
            "mask_feather": 12,
        }
    )


def tune_gold(recipe: dict, color: list[float], roughness: float) -> None:
    for material in recipe.get("material_map", []):
        contains = material.get("contains", [])
        if any(token in contains for token in ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"]):
            adjust = material.setdefault("source_material_adjust", {})
            adjust["base_color"] = color
            adjust["diffuse_color"] = color
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = 0.41


def add_soft_background(recipe: dict) -> None:
    recipe["postprocess"]["studio_background"] = {
        "enabled": True,
        "top_color": [248, 248, 247],
        "floor_color": [242, 242, 240],
        "floor_start": 0.56,
        "floor_strength": 0.58,
        "vignette": 4.0,
        "mask_cutoff": 0.31,
        "object_padding_px": 16,
        "object_feather": 4.0,
        "bright_object_keep": 0.34,
        "protect_feather": 1.4,
        "shadow_blur": 38.0,
        "shadows": [
            {"cx": 0.52, "cy": 0.78, "rx": 0.32, "ry": 0.052, "alpha": 18, "color": [72, 74, 76]},
            {"cx": 0.50, "cy": 0.70, "rx": 0.22, "ry": 0.030, "alpha": 8, "color": [80, 82, 84]},
        ],
    }


VARIANTS = [
    {
        "name": "v191a_soft_floor_physical",
        "exposure": -0.93,
        "lights": (0.90, 0.40, 0.58, 2.00, 0.012, 0.34),
        "gold": ([0.355, 0.374, 0.405, 1.0], 0.285),
        "center": (1.68, 0.92, 0.25, 0.54, 0.70),
        "background": False,
    },
    {
        "name": "v191b_soft_catalog_background",
        "exposure": -0.95,
        "lights": (0.92, 0.38, 0.56, 2.05, 0.011, 0.32),
        "gold": ([0.36, 0.378, 0.408, 1.0], 0.28),
        "center": (1.72, 0.915, 0.27, 0.56, 0.72),
        "background": True,
    },
    {
        "name": "v191c_crisper_less_halo",
        "exposure": -0.94,
        "lights": (0.94, 0.34, 0.52, 2.16, 0.010, 0.34),
        "gold": ([0.365, 0.383, 0.414, 1.0], 0.285),
        "center": (1.82, 0.905, 0.31, 0.54, 0.78),
        "background": False,
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v191 polish from v190b: keep improved diamond, reduce floor/halo harshness."
        recipe["render"]["samples"] = 820
        recipe["render"]["exposure"] = variant["exposure"]
        tune_lights(recipe, *variant["lights"])
        tune_gold(recipe, *variant["gold"])
        tune_center(recipe, *variant["center"])
        recipe["postprocess"].pop("studio_background", None)
        if variant["background"]:
            add_soft_background(recipe)
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

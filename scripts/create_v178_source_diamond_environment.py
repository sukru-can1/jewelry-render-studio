from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v177b_son2_source_diamond_center_contrast.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


CENTER_CROP = [0.335, 0.185, 0.665, 0.525]


CARD_ADJUSTMENTS = [
    {
        "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
        "scale": [1.35, 1.2, 1.0],
        "source_material_adjust": {
            "base_color": [0.001, 0.0012, 0.0018, 1.0],
            "base_color_mix": 1.0,
            "diffuse_color": [0.001, 0.0012, 0.0018, 1.0],
            "emission_color": [0.001, 0.0012, 0.0018, 1.0],
            "emission_color_mix": 1.0,
            "emission_strength_scale": 0.45,
            "roughness": 0.35,
        },
    },
    {
        "contains": ["MASTER_SCENE_dark_inner_reflection_low"],
        "source_material_adjust": {
            "base_color": [0.004, 0.0045, 0.006, 1.0],
            "base_color_mix": 1.0,
            "diffuse_color": [0.004, 0.0045, 0.006, 1.0],
            "roughness": 0.45,
        },
    },
]


def light_set(top: float, fill: float, low_top: float, sparkle: float) -> list[dict]:
    return [
        {"contains": ["large_front_left_softbox"], "power_scale": top},
        {"contains": ["weak_front_right_fill"], "power_scale": fill},
        {"contains": ["low_top_softbox"], "power_scale": low_top},
        {"contains": ["subtle_rear_rim"], "power_scale": 0.86},
        {"contains": ["diamond_micro_sparkle"], "power_scale": sparkle, "color": [0.92, 0.97, 1.0]},
    ]


VARIANTS = [
    {
        "name": "v178a_son2_diamond_dark_card_less_wash",
        "description": "Source studio with stronger dark diamond reflection card and reduced broad wash.",
        "render": {"samples": 820, "exposure": -0.74, "look": "Medium High Contrast"},
        "source_scene": {
            "object_adjustments": CARD_ADJUSTMENTS,
            "light_adjustments": light_set(0.80, 0.68, 0.78, 1.25),
        },
        "diamond_adjust": {"hsv_value_scale": 0.66, "glass_color_mix": 0.08, "saturation_scale": 0.70},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "autocontrast_cutoff": 0.35,
                "contrast": 1.26,
                "brightness": 0.975,
                "saturation": 0.90,
                "sharpness": 1.14,
                "unsharp_radius": 1.10,
                "unsharp_percent": 88,
                "unsharp_threshold": 2,
                "detail_amount": 0.12,
                "blend": 0.34,
                "mask_feather": 10,
            }
        },
    },
    {
        "name": "v178b_son2_diamond_sparkle_with_card",
        "description": "Source studio with darker facet card plus stronger cool sparkle pin for diamond fire.",
        "render": {"samples": 820, "exposure": -0.70, "look": "Medium High Contrast"},
        "source_scene": {
            "object_adjustments": CARD_ADJUSTMENTS,
            "light_adjustments": light_set(0.84, 0.72, 0.82, 1.55),
        },
        "diamond_adjust": {"hsv_value_scale": 0.68, "glass_color_mix": 0.05, "saturation_scale": 0.74},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "autocontrast_cutoff": 0.20,
                "contrast": 1.22,
                "brightness": 0.982,
                "saturation": 0.92,
                "sharpness": 1.12,
                "unsharp_radius": 1.0,
                "unsharp_percent": 78,
                "unsharp_threshold": 2,
                "detail_amount": 0.10,
                "blend": 0.30,
                "mask_feather": 10,
            }
        },
    },
    {
        "name": "v178c_son2_diamond_facets_stronger_post",
        "description": "Source studio with card-driven dark reflections and controlled post facet separation.",
        "render": {"samples": 820, "exposure": -0.76, "look": "Medium High Contrast"},
        "source_scene": {
            "object_adjustments": CARD_ADJUSTMENTS,
            "light_adjustments": light_set(0.78, 0.62, 0.72, 1.45),
        },
        "diamond_adjust": {"hsv_value_scale": 0.62, "glass_color_mix": 0.04, "saturation_scale": 0.66},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "autocontrast_cutoff": 0.45,
                "contrast": 1.30,
                "brightness": 0.965,
                "saturation": 0.88,
                "sharpness": 1.16,
                "unsharp_radius": 1.05,
                "unsharp_percent": 96,
                "unsharp_threshold": 2,
                "detail_amount": 0.14,
                "blend": 0.38,
                "mask_feather": 10,
            },
            "diamond_facets": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "facets": 32,
                "dark_alpha": 0.075,
                "light_alpha": 0.060,
                "chroma_alpha": 0.012,
                "line_alpha": 0.036,
                "table_radius": 0.16,
                "mask_feather": 12,
                "center_x": 0.5,
                "center_y": 0.53,
                "radius_x": 0.43,
                "radius_y": 0.40,
            },
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        variant = copy.deepcopy(variant)
        diamond_adjust = variant.pop("diamond_adjust")
        recipe = deep_merge(base, variant)
        diamond_rule = recipe["material_map"][1]
        diamond_rule["source_material_adjust"].update(diamond_adjust)
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

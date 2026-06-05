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


TIGHT_CENTER = [0.365, 0.205, 0.635, 0.485]


VARIANTS = [
    {
        "name": "v179a_son2_clean_metal_tighter_diamond_grade",
        "description": "Clean source-studio metal with tighter center-diamond post grade only.",
        "render": {"samples": 820, "exposure": -0.72, "look": "Medium High Contrast"},
        "source_scene": {
            "light_adjustments": [
                {"contains": ["large_front_left_softbox"], "power_scale": 0.92},
                {"contains": ["weak_front_right_fill"], "power_scale": 0.86},
                {"contains": ["low_top_softbox"], "power_scale": 0.92},
                {"contains": ["diamond_micro_sparkle"], "power_scale": 1.45, "color": [0.94, 0.98, 1.0]},
            ]
        },
        "diamond_adjust": {"hsv_value_scale": 0.64, "glass_color_mix": 0.02, "saturation_scale": 0.70},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_tight__"],
                "fallback_bounds_norm": TIGHT_CENTER,
                "autocontrast_cutoff": 0.55,
                "contrast": 1.38,
                "brightness": 0.965,
                "saturation": 0.88,
                "sharpness": 1.18,
                "unsharp_radius": 1.0,
                "unsharp_percent": 96,
                "unsharp_threshold": 2,
                "detail_amount": 0.15,
                "blend": 0.42,
                "mask_feather": 12,
            }
        },
    },
    {
        "name": "v179b_son2_clean_metal_more_black_facets",
        "description": "Clean source-studio metal with stronger center diamond dark-facet separation.",
        "render": {"samples": 820, "exposure": -0.74, "look": "Medium High Contrast"},
        "source_scene": {
            "light_adjustments": [
                {"contains": ["large_front_left_softbox"], "power_scale": 0.88},
                {"contains": ["weak_front_right_fill"], "power_scale": 0.82},
                {"contains": ["low_top_softbox"], "power_scale": 0.88},
                {"contains": ["diamond_micro_sparkle"], "power_scale": 1.55, "color": [0.94, 0.98, 1.0]},
            ]
        },
        "diamond_adjust": {"hsv_value_scale": 0.58, "glass_color_mix": 0.0, "saturation_scale": 0.64},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_tight__"],
                "fallback_bounds_norm": TIGHT_CENTER,
                "autocontrast_cutoff": 0.75,
                "contrast": 1.52,
                "brightness": 0.945,
                "saturation": 0.84,
                "sharpness": 1.20,
                "unsharp_radius": 0.95,
                "unsharp_percent": 110,
                "unsharp_threshold": 2,
                "detail_amount": 0.18,
                "blend": 0.48,
                "mask_feather": 13,
            }
        },
    },
    {
        "name": "v179c_son2_clean_metal_subtle_star_facets",
        "description": "Clean source-studio metal with tight center grade and restrained facet overlay.",
        "render": {"samples": 820, "exposure": -0.73, "look": "Medium High Contrast"},
        "source_scene": {
            "light_adjustments": [
                {"contains": ["large_front_left_softbox"], "power_scale": 0.90},
                {"contains": ["weak_front_right_fill"], "power_scale": 0.84},
                {"contains": ["low_top_softbox"], "power_scale": 0.90},
                {"contains": ["diamond_micro_sparkle"], "power_scale": 1.50, "color": [0.94, 0.98, 1.0]},
            ]
        },
        "diamond_adjust": {"hsv_value_scale": 0.60, "glass_color_mix": 0.0, "saturation_scale": 0.66},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_tight__"],
                "fallback_bounds_norm": TIGHT_CENTER,
                "autocontrast_cutoff": 0.60,
                "contrast": 1.42,
                "brightness": 0.955,
                "saturation": 0.86,
                "sharpness": 1.18,
                "unsharp_radius": 1.0,
                "unsharp_percent": 100,
                "unsharp_threshold": 2,
                "detail_amount": 0.16,
                "blend": 0.44,
                "mask_feather": 13,
            },
            "diamond_facets": {
                "enabled": True,
                "object_contains": ["__center_diamond_tight__"],
                "fallback_bounds_norm": TIGHT_CENTER,
                "facets": 32,
                "dark_alpha": 0.055,
                "light_alpha": 0.045,
                "chroma_alpha": 0.008,
                "line_alpha": 0.024,
                "table_radius": 0.15,
                "mask_feather": 14,
                "center_x": 0.5,
                "center_y": 0.53,
                "radius_x": 0.45,
                "radius_y": 0.42,
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

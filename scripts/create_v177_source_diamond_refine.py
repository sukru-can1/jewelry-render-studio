from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v176b_son2_source_white_gold_deep_but_clean.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


DIAMOND_RULE = {
    "contains": ["Diamond_Round"],
    "source_material": "MASTER_SCENE_clear_cut_diamond_glass",
    "source_material_adjust": {
        "glass_color": [0.92, 0.965, 1.0, 1.0],
        "glass_color_mix": 0.20,
        "base_color": [0.50, 0.56, 0.66, 1.0],
        "base_color_mix": 0.08,
        "diffuse_color": [0.48, 0.54, 0.64, 1.0],
        "roughness": 0.0,
        "glass_roughness": 0.0,
        "ior": 2.417,
        "saturation_scale": 0.82,
        "hsv_value_scale": 0.78,
        "hsv_value_max": 0.95,
    },
}


CENTER_CROP = [0.335, 0.185, 0.665, 0.525]


VARIANTS = [
    {
        "name": "v177a_son2_source_diamond_material_crisper",
        "description": "Source scene/studio preserved. Diamond object material tuned cooler and less milky while keeping white-gold grade.",
        "render": {"samples": 760, "exposure": -0.74, "look": "Medium High Contrast"},
        "diamond_adjust": {"hsv_value_scale": 0.76, "glass_color_mix": 0.18},
        "postprocess": {},
    },
    {
        "name": "v177b_son2_source_diamond_center_contrast",
        "description": "Source scene/studio preserved. Diamond material plus local center-stone contrast/detail recovery.",
        "render": {"samples": 760, "exposure": -0.76, "look": "Medium High Contrast"},
        "diamond_adjust": {"hsv_value_scale": 0.72, "glass_color_mix": 0.16},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "contrast": 1.18,
                "brightness": 0.985,
                "sharpness": 1.10,
                "unsharp_radius": 1.15,
                "unsharp_percent": 72,
                "unsharp_threshold": 3,
                "detail_amount": 0.09,
                "blend": 0.24,
                "mask_feather": 9,
            }
        },
    },
    {
        "name": "v177c_son2_source_diamond_subtle_facets",
        "description": "Source scene/studio preserved. Diamond material plus restrained post-production facet definition.",
        "render": {"samples": 760, "exposure": -0.78, "look": "Medium High Contrast"},
        "diamond_adjust": {"hsv_value_scale": 0.70, "glass_color_mix": 0.14, "saturation_scale": 0.76},
        "postprocess": {
            "center_stone": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "contrast": 1.15,
                "brightness": 0.98,
                "sharpness": 1.08,
                "unsharp_radius": 1.05,
                "unsharp_percent": 58,
                "unsharp_threshold": 3,
                "detail_amount": 0.07,
                "blend": 0.20,
                "mask_feather": 10,
            },
            "diamond_facets": {
                "enabled": True,
                "object_contains": ["__center_diamond_crop__"],
                "fallback_bounds_norm": CENTER_CROP,
                "facets": 30,
                "dark_alpha": 0.055,
                "light_alpha": 0.050,
                "chroma_alpha": 0.010,
                "line_alpha": 0.026,
                "mask_feather": 11,
                "center_x": 0.5,
                "center_y": 0.53,
                "radius_x": 0.43,
                "radius_y": 0.40,
                "rotation": 0.08,
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
        recipe["material_map"] = copy.deepcopy(base["material_map"])
        diamond_rule = copy.deepcopy(DIAMOND_RULE)
        diamond_rule["source_material_adjust"].update(diamond_adjust)
        recipe["material_map"].append(diamond_rule)
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

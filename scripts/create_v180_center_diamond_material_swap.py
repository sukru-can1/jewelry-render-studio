from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v179a_son2_clean_metal_tighter_diamond_grade.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


CENTER_CROP = [0.365, 0.205, 0.635, 0.485]


def center_post(contrast: float, brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "object_contains": ["__center_diamond_tight__"],
        "fallback_bounds_norm": CENTER_CROP,
        "autocontrast_cutoff": 0.55,
        "contrast": contrast,
        "brightness": brightness,
        "saturation": 0.86,
        "sharpness": 1.18,
        "unsharp_radius": 1.0,
        "unsharp_percent": 100,
        "unsharp_threshold": 2,
        "detail_amount": 0.16,
        "blend": blend,
        "mask_feather": 13,
    }


VARIANTS = [
    {
        "name": "v180a_son2_center_procedural_diamond",
        "description": "Clean metal, side stones preserved, center stone swapped to Procedural Diamond material.",
        "center_material": "Procedural Diamond.001",
        "render": {"samples": 860, "exposure": -0.72, "look": "Medium High Contrast"},
        "center_adjust": {
            "glass_color": [1.0, 1.0, 1.0, 1.0],
            "glass_color_mix": 0.0,
            "glass_roughness": 0.0,
            "ior": 2.417,
            "saturation_scale": 0.82,
            "hsv_value_scale": 0.72,
            "hsv_value_max": 0.96,
            "diffuse_color": [0.62, 0.65, 0.70, 1.0],
        },
        "postprocess": {"center_stone": center_post(1.34, 0.965, 0.40)},
    },
    {
        "name": "v180b_son2_center_dimond_shader",
        "description": "Clean metal, side stones preserved, center stone swapped to Dimond material.",
        "center_material": "Dimond",
        "render": {"samples": 860, "exposure": -0.72, "look": "Medium High Contrast"},
        "center_adjust": {
            "glass_color": [0.96, 0.985, 1.0, 1.0],
            "glass_color_mix": 0.06,
            "glass_roughness": 0.0,
            "ior": 2.417,
            "saturation_scale": 0.76,
            "hsv_value_scale": 0.68,
            "hsv_value_max": 0.96,
            "diffuse_color": [0.58, 0.62, 0.68, 1.0],
        },
        "postprocess": {"center_stone": center_post(1.38, 0.955, 0.43)},
    },
    {
        "name": "v180c_son2_center_source_shader_deep_grade",
        "description": "Clean metal and source diamond shader with deeper center-only grade.",
        "center_material": "MASTER_SCENE_clear_cut_diamond_glass",
        "render": {"samples": 860, "exposure": -0.74, "look": "Medium High Contrast"},
        "center_adjust": {
            "glass_color": [1.0, 1.0, 1.0, 1.0],
            "glass_color_mix": 0.0,
            "glass_roughness": 0.0,
            "ior": 2.417,
            "saturation_scale": 0.62,
            "hsv_value_scale": 0.54,
            "hsv_value_max": 0.90,
            "diffuse_color": [0.50, 0.54, 0.62, 1.0],
        },
        "postprocess": {"center_stone": center_post(1.48, 0.94, 0.48)},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        variant = copy.deepcopy(variant)
        center_material = variant.pop("center_material")
        center_adjust = variant.pop("center_adjust")
        recipe = deep_merge(base, variant)
        gold_rule = recipe["material_map"][0]
        side_rule = copy.deepcopy(recipe["material_map"][1])
        side_rule["contains"] = ["Diamond_Round"]
        center_rule = {
            "contains": ["Diamond_Round_11"],
            "source_material": center_material,
            "source_material_adjust": center_adjust,
        }
        recipe["material_map"] = [gold_rule, center_rule, side_rule]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

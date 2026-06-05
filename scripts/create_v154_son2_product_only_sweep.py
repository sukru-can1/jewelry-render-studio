from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")


BASE = {
    "name": "",
    "description": "son2.blend product-only diagnostic render. Excludes baked studio/floor/card meshes from the source blend.",
    "material_strategy": "override",
    "render": {
        "resolution": [1200, 1200],
        "samples": 280,
        "denoise": True,
        "transparent": False,
        "view_transform": "Filmic",
        "look": "Medium High Contrast",
        "exposure": -0.08,
        "gamma": 1.0,
    },
    "camera": {
        "position": [0.0, -4.8, 2.0],
        "target": [0.0, 0.0, 0.34],
        "focal_length": 78,
        "depth_of_field": {"enabled": True, "f_stop": 10},
        "shift_y": 0.02,
    },
    "world": {"color": [0.82, 0.82, 0.82], "strength": 0.025},
    "background": {"color": [0.76, 0.76, 0.765, 1.0], "plane_size": 42.0, "plane_z": -0.22},
    "model": {
        "auto_center": True,
        "auto_scale": True,
        "target_size": 2.6,
        "rotation_degrees": [0, 0, 0],
        "translation": [0.0, 0.0, 0.0],
        "ground_to_plane": True,
        "ground_clearance": 0.055,
        "shade_smooth": True,
        "shade_smooth_exclude_contains": ["diamond", "round_", "gem"],
        "include_contains": [
            "diamond_round",
            "prong",
            "object_3",
            "object_4",
            "object_5",
            "object_6",
        ],
        "exclude_contains": [
            "floor",
            "card",
            "shadow",
            "scene_dark",
            "reflection",
            "camera",
            "light",
            "plane",
        ],
    },
    "material_map": [
        {"contains": ["diamond_round"], "material": "diamond_center"},
        {"contains": ["prong", "object_"], "material": "white_gold_polished"},
    ],
    "materials": {
        "white_gold_polished": {
            "type": "metal",
            "base_color": [0.46, 0.47, 0.49, 1.0],
            "metallic": 1.0,
            "roughness": 0.13,
            "specular_ior_level": 0.78,
        },
        "diamond_center": {
            "type": "catalog_diamond",
            "glass_color": [1.0, 1.0, 1.0, 1.0],
            "gloss_color": [1.0, 1.0, 1.0, 1.0],
            "roughness": 0.0,
            "gloss_roughness": 0.004,
            "ior": 2.417,
            "transparent_mix": 0.035,
        },
    },
    "lights": [
        {
            "name": "large_top_softbox",
            "type": "AREA",
            "position": [0.0, -1.15, 3.75],
            "rotation_degrees": [58, 0, 0],
            "size": 4.0,
            "size_y": 3.5,
            "power": 150,
        },
        {
            "name": "right_rim_strip",
            "type": "AREA",
            "position": [2.25, -0.25, 1.55],
            "rotation_degrees": [76, 0, 48],
            "size": 0.95,
            "size_y": 2.2,
            "power": 260,
        },
        {
            "name": "left_soft_strip",
            "type": "AREA",
            "position": [-2.2, -2.0, 1.15],
            "rotation_degrees": [72, 0, -36],
            "size": 1.25,
            "size_y": 2.2,
            "power": 28,
        },
        {"name": "diamond_pin_1", "type": "POINT", "position": [-0.45, -0.9, 1.35], "power": 430, "shadow_soft_size": 0.012},
        {"name": "diamond_pin_2", "type": "POINT", "position": [0.55, -1.08, 1.52], "power": 360, "shadow_soft_size": 0.01},
    ],
    "reflection_cards": [
        {
            "name": "front_low_black_reflection",
            "position": [0.0, -2.25, 0.36],
            "rotation_degrees": [86, 0, 0],
            "size": [5.2, 0.75],
            "color": [0.012, 0.012, 0.014, 1.0],
            "visible_to_camera": False,
        },
        {
            "name": "left_side_dark_mirror",
            "position": [-2.8, -1.25, 0.78],
            "rotation_degrees": [72, 0, -72],
            "size": [2.2, 2.6],
            "color": [0.018, 0.018, 0.02, 1.0],
            "visible_to_camera": False,
        },
        {
            "name": "right_side_dark_mirror",
            "position": [2.8, -1.25, 0.78],
            "rotation_degrees": [72, 0, 72],
            "size": [2.2, 2.6],
            "color": [0.018, 0.018, 0.02, 1.0],
            "visible_to_camera": False,
        },
        {
            "name": "upper_facet_dark_card",
            "position": [-0.15, -0.75, 2.1],
            "rotation_degrees": [34, 0, -22],
            "size": [4.3, 1.2],
            "color": [0.02, 0.022, 0.026, 1.0],
            "visible_to_camera": False,
        },
        {
            "name": "rear_gray_background_card",
            "position": [0.0, 2.15, 1.25],
            "rotation_degrees": [90, 0, 0],
            "size": [15.0, 6.0],
            "color": [0.58, 0.58, 0.585, 1.0],
            "visible_to_camera": True,
        },
    ],
    "postprocess": {
        "product": {
            "enabled": True,
            "padding_px": 90,
            "contrast": 1.08,
            "brightness": 0.96,
            "saturation": 0.96,
            "sharpness": 1.03,
            "unsharp_radius": 0.7,
            "unsharp_percent": 48,
            "unsharp_threshold": 2,
            "blend": 0.14,
            "mask_feather": 130,
        }
    },
}


VARIANTS = [
    {
        "name": "v154a_son2_product_only_front",
        "model": {"rotation_degrees": [0, 0, 0]},
        "camera": {"position": [0.0, -4.8, 2.0], "target": [0.0, 0.0, 0.34], "focal_length": 76},
    },
    {
        "name": "v154b_son2_product_only_ring99_tilt",
        "model": {"rotation_degrees": [84, 0, 0], "target_size": 2.35},
        "camera": {"position": [0.0, -5.0, 1.65], "target": [0.0, 0.0, 0.22], "focal_length": 80},
    },
    {
        "name": "v154c_son2_product_only_top3q",
        "model": {"rotation_degrees": [68, 0, 0], "target_size": 2.45},
        "camera": {"position": [0.0, -5.05, 2.25], "target": [0.0, 0.0, 0.34], "focal_length": 82},
    },
]


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        recipe = deep_merge(BASE, variant)
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

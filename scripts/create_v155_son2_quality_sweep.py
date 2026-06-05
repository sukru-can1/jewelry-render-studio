from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v154b_son2_product_only_ring99_tilt.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def source_material_recipe(base: dict) -> dict:
    recipe = copy.deepcopy(base)
    recipe["material_strategy"] = "hybrid"
    recipe["material_map"] = [
        {
            "contains": ["diamond_round_11"],
            "source_material": "MASTER_SCENE_clear_cut_diamond_glass",
            "source_material_adjust": {
                "glass_color": [0.96, 0.985, 1.0, 1.0],
                "glass_color_mix": 0.18,
                "glass_roughness": 0.0,
                "ior": 2.417,
                "saturation_scale": 0.82,
                "hsv_value_scale": 0.56,
                "hsv_value_max": 1.0,
                "diffuse_color": [0.56, 0.59, 0.64, 1.0],
            },
        },
        {
            "contains": ["diamond_round"],
            "source_material": "MASTER_SCENE_clear_cut_diamond_glass",
            "source_material_adjust": {
                "glass_color": [0.98, 0.99, 1.0, 1.0],
                "glass_color_mix": 0.12,
                "glass_roughness": 0.0,
                "ior": 2.417,
                "saturation_scale": 0.9,
                "hsv_value_scale": 0.68,
                "hsv_value_max": 1.05,
                "diffuse_color": [0.62, 0.65, 0.7, 1.0],
            },
        },
        {
            "contains": ["prong", "object_"],
            "source_material": "MASTER_SCENE_realistic_polished_gold",
            "source_material_adjust": {
                "base_color": [0.42, 0.435, 0.46, 1.0],
                "base_color_mix": 1.0,
                "metallic": 1.0,
                "roughness": 0.115,
                "specular_ior_level": 0.78,
                "diffuse_color": [0.42, 0.435, 0.46, 1.0],
            },
        },
    ]
    return recipe


VARIANTS = [
    {
        "name": "v155a_son2_b_view_source_diamond_darker_metal",
        "render": {"exposure": -0.16, "samples": 360},
        "world": {"strength": 0.012, "color": [0.74, 0.74, 0.745]},
        "background": {"color": [0.70, 0.70, 0.705, 1.0]},
        "camera": {"focal_length": 84, "position": [0.0, -5.15, 1.72], "target": [0.0, 0.0, 0.24]},
        "model": {"target_size": 2.22, "ground_clearance": 0.07},
        "lights": [
            {"name": "large_top_softbox", "type": "AREA", "position": [0.0, -1.2, 3.7], "rotation_degrees": [58, 0, 0], "size": 3.8, "size_y": 3.4, "power": 95},
            {"name": "right_rim_strip", "type": "AREA", "position": [2.15, -0.18, 1.55], "rotation_degrees": [76, 0, 48], "size": 0.9, "size_y": 2.1, "power": 300},
            {"name": "left_soft_strip", "type": "AREA", "position": [-2.35, -2.05, 1.1], "rotation_degrees": [72, 0, -36], "size": 1.15, "size_y": 2.0, "power": 10},
            {"name": "diamond_pin_1", "type": "POINT", "position": [-0.45, -0.9, 1.35], "power": 620, "shadow_soft_size": 0.008},
            {"name": "diamond_pin_2", "type": "POINT", "position": [0.58, -1.08, 1.55], "power": 520, "shadow_soft_size": 0.007},
        ],
    },
    {
        "name": "v155b_son2_b_view_crisper_center_more_dark_flags",
        "render": {"exposure": -0.19, "samples": 360},
        "world": {"strength": 0.008, "color": [0.70, 0.70, 0.705]},
        "background": {"color": [0.68, 0.68, 0.685, 1.0]},
        "camera": {"focal_length": 86, "position": [0.0, -5.25, 1.72], "target": [0.0, 0.0, 0.22]},
        "model": {"target_size": 2.18, "ground_clearance": 0.075},
        "reflection_cards": [
            {
                "name": "front_low_black_reflection",
                "position": [0.0, -2.2, 0.34],
                "rotation_degrees": [86, 0, 0],
                "size": [5.8, 0.82],
                "color": [0.006, 0.006, 0.008, 1.0],
                "visible_to_camera": False,
            },
            {
                "name": "left_side_dark_mirror",
                "position": [-2.45, -1.1, 0.82],
                "rotation_degrees": [72, 0, -76],
                "size": [2.8, 2.9],
                "color": [0.008, 0.008, 0.01, 1.0],
                "visible_to_camera": False,
            },
            {
                "name": "right_side_dark_mirror",
                "position": [2.45, -1.1, 0.82],
                "rotation_degrees": [72, 0, 76],
                "size": [2.8, 2.9],
                "color": [0.008, 0.008, 0.01, 1.0],
                "visible_to_camera": False,
            },
            {
                "name": "upper_facet_dark_card",
                "position": [-0.08, -0.62, 2.05],
                "rotation_degrees": [32, 0, -18],
                "size": [4.8, 1.35],
                "color": [0.008, 0.009, 0.012, 1.0],
                "visible_to_camera": False,
            },
            {
                "name": "rear_gray_background_card",
                "position": [0.0, 2.15, 1.25],
                "rotation_degrees": [90, 0, 0],
                "size": [15.0, 6.0],
                "color": [0.52, 0.52, 0.525, 1.0],
                "visible_to_camera": True,
            },
        ],
    },
    {
        "name": "v155c_son2_slightly_higher_less_white",
        "render": {"exposure": -0.15, "samples": 360},
        "world": {"strength": 0.01, "color": [0.72, 0.72, 0.725]},
        "background": {"color": [0.69, 0.69, 0.695, 1.0]},
        "camera": {"focal_length": 82, "position": [0.0, -5.15, 1.95], "target": [0.0, 0.0, 0.26]},
        "model": {"target_size": 2.2, "ground_clearance": 0.07},
    },
]


def main() -> None:
    base = source_material_recipe(json.loads(BASE_PATH.read_text(encoding="utf-8-sig")))
    for variant in VARIANTS:
        recipe = deep_merge(base, variant)
        recipe["description"] = (
            "son2 quality pass from v154b. Product-only filter, source diamond material adjusted darker, "
            "silver metal darkened, and studio reflections reduced to avoid white shank wash."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

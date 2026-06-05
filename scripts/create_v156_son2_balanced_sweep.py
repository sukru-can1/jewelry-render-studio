from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v155a_son2_b_view_source_diamond_darker_metal.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def set_material_adjust(recipe: dict, metal_base: list[float], metal_roughness: float, center_value: float) -> None:
    for rule in recipe["material_map"]:
        contains = [token.lower() for token in rule.get("contains", [])]
        adjust = rule.get("source_material_adjust")
        if not adjust:
            continue
        if "diamond_round_11" in contains:
            adjust["hsv_value_scale"] = center_value
            adjust["glass_color_mix"] = 0.14
            adjust["diffuse_color"] = [0.58, 0.61, 0.66, 1.0]
        elif "prong" in contains or "object_" in contains:
            adjust["base_color"] = metal_base
            adjust["diffuse_color"] = metal_base
            adjust["roughness"] = metal_roughness


REFLECTION_CARDS = [
    {
        "name": "front_low_black_reflection",
        "position": [0.0, -2.18, 0.34],
        "rotation_degrees": [86, 0, 0],
        "size": [5.8, 0.82],
        "color": [0.008, 0.008, 0.01, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "left_side_dark_mirror",
        "position": [-2.55, -1.05, 0.84],
        "rotation_degrees": [72, 0, -76],
        "size": [2.65, 2.85],
        "color": [0.01, 0.01, 0.012, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "right_side_dark_mirror",
        "position": [2.55, -1.05, 0.84],
        "rotation_degrees": [72, 0, 76],
        "size": [2.65, 2.85],
        "color": [0.01, 0.01, 0.012, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "left_shoulder_gray_break",
        "position": [-1.85, -2.1, 0.82],
        "rotation_degrees": [78, 0, -42],
        "size": [1.7, 1.1],
        "color": [0.105, 0.108, 0.118, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "right_shoulder_gray_break",
        "position": [1.85, -2.1, 0.82],
        "rotation_degrees": [78, 0, 42],
        "size": [1.7, 1.1],
        "color": [0.105, 0.108, 0.118, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "upper_facet_dark_card",
        "position": [-0.08, -0.62, 2.05],
        "rotation_degrees": [32, 0, -18],
        "size": [4.5, 1.25],
        "color": [0.012, 0.013, 0.016, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "rear_gray_background_card",
        "position": [0.0, 2.15, 1.25],
        "rotation_degrees": [90, 0, 0],
        "size": [15.0, 6.0],
        "color": [0.55, 0.55, 0.555, 1.0],
        "visible_to_camera": True,
    },
]


VARIANTS = [
    {
        "name": "v156a_son2_balanced_dark_metal_clear_diamond",
        "render": {"samples": 420, "exposure": -0.17},
        "world": {"strength": 0.009, "color": [0.72, 0.72, 0.725]},
        "background": {"color": [0.69, 0.69, 0.695, 1.0]},
        "camera": {"focal_length": 84, "position": [0.0, -5.18, 1.76], "target": [0.0, 0.0, 0.24]},
        "model": {"target_size": 2.2, "ground_clearance": 0.072},
        "reflection_cards": REFLECTION_CARDS,
        "material_tuning": {"metal_base": [0.36, 0.375, 0.405, 1.0], "metal_roughness": 0.13, "center_value": 0.60},
    },
    {
        "name": "v156b_son2_slightly_brighter_center_stronger_side_lines",
        "render": {"samples": 420, "exposure": -0.15},
        "world": {"strength": 0.01, "color": [0.73, 0.73, 0.735]},
        "background": {"color": [0.70, 0.70, 0.705, 1.0]},
        "camera": {"focal_length": 85, "position": [0.0, -5.2, 1.74], "target": [0.0, 0.0, 0.235]},
        "model": {"target_size": 2.19, "ground_clearance": 0.074},
        "reflection_cards": REFLECTION_CARDS,
        "material_tuning": {"metal_base": [0.38, 0.395, 0.425, 1.0], "metal_roughness": 0.125, "center_value": 0.64},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        tuning = variant.pop("material_tuning")
        recipe = deep_merge(base, variant)
        set_material_adjust(recipe, tuning["metal_base"], tuning["metal_roughness"], tuning["center_value"])
        recipe["description"] = (
            "son2 balanced pass from v155a. Keeps source diamond facets, darkens white-gold shoulder wash, "
            "and uses controlled dark/gray reflection cards."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

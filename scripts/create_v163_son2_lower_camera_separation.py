from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v162a_son2_glossy_only_lower_reflection.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def tune_center(recipe: dict, *, value: float, glass_mix: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "diamond_round_11" not in tokens:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = [0.55, 0.59, 0.65, 1.0]


def contact_separation_mask(*, brightness: float, contrast: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [
            [0.355, 0.635, 0.645, 0.842],
            [0.18, 0.735, 0.82, 0.93],
        ],
        "blur_radius": 0.35,
        "brightness": brightness,
        "contrast": contrast,
        "saturation": 0.92,
        "blend": blend,
        "mask_feather": 26,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v163a_son2_lower_camera_moderate_lift",
        "render": {"samples": 680, "exposure": -0.18},
        "camera": {
            "position": [0.0, -5.1, 1.38],
            "target": [0.0, 0.0, 0.22],
            "focal_length": 86,
            "shift_y": 0.035,
        },
        "model": {"ground_clearance": 0.125, "target_size": 2.15},
        "world": {"color": [0.625, 0.625, 0.63], "strength": 0.0035},
        "background": {"color": [0.62, 0.62, 0.625, 1.0]},
        "postprocess": {
            "product": {"brightness": 0.928, "contrast": 1.055, "blend": 0.1},
            "side_soften": contact_separation_mask(brightness=0.86, contrast=1.08, blend=0.12),
        },
        "center": {"value": 0.55, "glass_mix": 0.17},
    },
    {
        "name": "v163b_son2_lower_camera_direct_facets",
        "render": {"samples": 680, "exposure": -0.185},
        "camera": {
            "position": [0.0, -5.0, 1.18],
            "target": [0.0, 0.0, 0.2],
            "focal_length": 88,
            "shift_y": 0.045,
        },
        "model": {"ground_clearance": 0.15, "target_size": 2.1},
        "world": {"color": [0.61, 0.61, 0.615], "strength": 0.003},
        "background": {"color": [0.61, 0.61, 0.615, 1.0]},
        "postprocess": {
            "product": {"brightness": 0.922, "contrast": 1.06, "blend": 0.11},
            "side_soften": contact_separation_mask(brightness=0.84, contrast=1.1, blend=0.14),
        },
        "center": {"value": 0.53, "glass_mix": 0.18},
    },
    {
        "name": "v163c_son2_lower_camera_cleaner_floor_gap",
        "render": {"samples": 680, "exposure": -0.175},
        "camera": {
            "position": [0.0, -5.15, 1.45],
            "target": [0.0, 0.0, 0.24],
            "focal_length": 84,
            "shift_y": 0.03,
        },
        "model": {"ground_clearance": 0.16, "target_size": 2.12},
        "world": {"color": [0.635, 0.635, 0.64], "strength": 0.0035},
        "background": {"color": [0.625, 0.625, 0.63, 1.0]},
        "postprocess": {
            "product": {"brightness": 0.93, "contrast": 1.05, "blend": 0.09},
            "side_soften": contact_separation_mask(brightness=0.88, contrast=1.06, blend=0.1),
        },
        "center": {"value": 0.56, "glass_mix": 0.16},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        center = variant.pop("center")
        recipe = deep_merge(base, variant)
        tune_center(recipe, **center)
        recipe["description"] = (
            "son2 v163 lower-camera pass. Brings camera down to face the diamond facets more directly and "
            "raises/darkens floor separation so the product bottom does not merge into the floor."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

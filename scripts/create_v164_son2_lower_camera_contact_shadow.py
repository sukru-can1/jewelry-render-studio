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


def shadow_safe_cards(cards: list[dict]) -> list[dict]:
    safe = []
    for card in cards:
        item = copy.deepcopy(card)
        if not item.get("visible_to_camera", False):
            item["visible_to_shadow"] = False
            item.setdefault("visible_to_diffuse", False)
        safe.append(item)
    return safe


def tune_center(recipe: dict, *, value: float, glass_mix: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "diamond_round_11" not in tokens:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = [0.55, 0.59, 0.65, 1.0]


def product_mask(*, stone_brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.355, 0.635, 0.645, 0.842]],
        "blur_radius": 0.25,
        "brightness": stone_brightness,
        "contrast": 1.08,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 24,
        "mask_shape": "ellipse",
    }


def contact_shadow(*, alpha: float, size: list[float], y: float = -0.08, spread: float = 0.72) -> list[dict]:
    return [
        {
            "name": "product_soft_contact_shadow",
            "position": [0.0, y, -0.216],
            "size": size,
            "rotation_degrees": 0,
            "color": [0.0, 0.0, 0.0],
            "alpha": alpha,
            "layers": 5,
            "spread": spread,
            "vertices": 128,
        }
    ]


VARIANTS = [
    {
        "name": "v164a_son2_low_camera_soft_separation",
        "render": {"samples": 700, "exposure": -0.178},
        "camera": {
            "position": [0.0, -5.1, 1.28],
            "target": [0.0, 0.0, 0.22],
            "focal_length": 86,
            "shift_y": 0.045,
        },
        "model": {"ground_clearance": 0.14, "target_size": 2.12},
        "world": {"color": [0.68, 0.68, 0.685], "strength": 0.0025},
        "background": {"color": [0.66, 0.66, 0.665, 1.0], "plane_size": 150.0, "plane_z": -0.22},
        "postprocess": {
            "product": {"brightness": 0.936, "contrast": 1.052, "blend": 0.09},
            "side_soften": product_mask(stone_brightness=0.84, blend=0.12),
        },
        "contact_shadows": contact_shadow(alpha=0.16, size=[2.65, 0.5]),
        "center": {"value": 0.56, "glass_mix": 0.16},
    },
    {
        "name": "v164b_son2_low_camera_stronger_floor_separation",
        "render": {"samples": 700, "exposure": -0.182},
        "camera": {
            "position": [0.0, -5.0, 1.18],
            "target": [0.0, 0.0, 0.2],
            "focal_length": 88,
            "shift_y": 0.052,
        },
        "model": {"ground_clearance": 0.17, "target_size": 2.08},
        "world": {"color": [0.66, 0.66, 0.665], "strength": 0.002},
        "background": {"color": [0.64, 0.64, 0.645, 1.0], "plane_size": 150.0, "plane_z": -0.22},
        "postprocess": {
            "product": {"brightness": 0.93, "contrast": 1.058, "blend": 0.1},
            "side_soften": product_mask(stone_brightness=0.82, blend=0.14),
        },
        "contact_shadows": contact_shadow(alpha=0.2, size=[2.85, 0.56], y=-0.06),
        "center": {"value": 0.54, "glass_mix": 0.17},
    },
    {
        "name": "v164c_son2_catalog_front_no_horizon",
        "render": {"samples": 700, "exposure": -0.17},
        "camera": {
            "position": [0.0, -5.2, 1.42],
            "target": [0.0, 0.0, 0.24],
            "focal_length": 84,
            "shift_y": 0.04,
        },
        "model": {"ground_clearance": 0.15, "target_size": 2.14},
        "world": {"color": [0.69, 0.69, 0.695], "strength": 0.0025},
        "background": {"color": [0.67, 0.67, 0.675, 1.0], "plane_size": 150.0, "plane_z": -0.22},
        "postprocess": {
            "product": {"brightness": 0.94, "contrast": 1.05, "blend": 0.085},
            "side_soften": product_mask(stone_brightness=0.86, blend=0.1),
        },
        "contact_shadows": contact_shadow(alpha=0.14, size=[2.55, 0.48]),
        "center": {"value": 0.57, "glass_mix": 0.15},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    base["reflection_cards"] = [
        card for card in shadow_safe_cards(base.get("reflection_cards", []))
        if not card.get("visible_to_camera", False)
    ]
    for variant in VARIANTS:
        center = variant.pop("center")
        recipe = deep_merge(base, variant)
        tune_center(recipe, **center)
        recipe["description"] = (
            "son2 v164 different composition: lower camera, no camera-visible horizon card, large floor, "
            "raised product clearance, and renderer-generated soft contact shadow for bottom separation."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

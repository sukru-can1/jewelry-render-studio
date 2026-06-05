from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v160b_son2_less_aggressive_flash_control.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def ray_card(
    name: str,
    position: list[float],
    rotation: list[float],
    size: list[float],
    color: list[float],
    *,
    transmission: bool,
) -> dict:
    return {
        "name": name,
        "position": position,
        "rotation_degrees": rotation,
        "size": size,
        "color": color,
        "visible_to_camera": False,
        "visible_to_shadow": False,
        "visible_to_diffuse": False,
        "visible_to_glossy": True,
        "visible_to_transmission": transmission,
        "visible_to_volume_scatter": False,
    }


def tune_center(recipe: dict, *, value: float, glass_mix: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "diamond_round_11" not in tokens:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["hsv_value_max"] = 0.96
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = [0.56, 0.6, 0.66, 1.0]


def center_mask(*, brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.355, 0.635, 0.645, 0.842]],
        "blur_radius": 0.25,
        "brightness": brightness,
        "contrast": 1.08,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 24,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v162a_son2_glossy_only_lower_reflection",
        "render": {"samples": 640, "exposure": -0.18},
        "postprocess": {
            "side_soften": center_mask(brightness=0.82, blend=0.14),
            "product": {"brightness": 0.934, "contrast": 1.055, "blend": 0.1},
        },
        "center": {"value": 0.56, "glass_mix": 0.16},
        "cards": [
            ray_card(
                "glossy_only_lower_stone_gray_reflector",
                [0.0, -1.2, 0.28],
                [73, 0, 0],
                [1.35, 0.28],
                [0.14, 0.145, 0.155, 1.0],
                transmission=False,
            )
        ],
    },
    {
        "name": "v162b_son2_weak_transmission_gray_floor_cut",
        "render": {"samples": 640, "exposure": -0.182},
        "world": {"color": [0.64, 0.64, 0.645], "strength": 0.0035},
        "background": {"color": [0.64, 0.64, 0.645, 1.0]},
        "postprocess": {
            "side_soften": center_mask(brightness=0.84, blend=0.12),
            "product": {"brightness": 0.934, "contrast": 1.055, "blend": 0.1},
        },
        "center": {"value": 0.57, "glass_mix": 0.14},
        "cards": [
            ray_card(
                "weak_transmission_lower_stone_gray_reflector",
                [0.0, -1.28, 0.24],
                [74, 0, 0],
                [1.05, 0.22],
                [0.24, 0.245, 0.255, 1.0],
                transmission=True,
            )
        ],
    },
    {
        "name": "v162c_son2_higher_camera_less_floor_pickup",
        "render": {"samples": 640, "exposure": -0.175},
        "camera": {"position": [0.0, -5.08, 1.95], "target": [0.0, 0.0, 0.28], "focal_length": 84},
        "world": {"color": [0.65, 0.65, 0.655], "strength": 0.004},
        "background": {"color": [0.65, 0.65, 0.655, 1.0]},
        "postprocess": {
            "side_soften": center_mask(brightness=0.84, blend=0.12),
            "product": {"brightness": 0.936, "contrast": 1.05, "blend": 0.09},
        },
        "center": {"value": 0.58, "glass_mix": 0.14},
        "cards": [
            ray_card(
                "higher_view_glossy_only_lower_gray_reflector",
                [0.0, -1.18, 0.3],
                [73, 0, 0],
                [1.1, 0.24],
                [0.16, 0.165, 0.175, 1.0],
                transmission=False,
            )
        ],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        center = variant.pop("center")
        cards = variant.pop("cards")
        recipe = deep_merge(base, variant)
        recipe.setdefault("reflection_cards", []).extend(copy.deepcopy(cards))
        tune_center(recipe, **center)
        recipe["description"] = (
            "son2 v162 subtle lower-stone fix. Uses small gray reflection-only cards instead of black "
            "transmission blockers, reducing floor pickup without making the diamond smoky."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

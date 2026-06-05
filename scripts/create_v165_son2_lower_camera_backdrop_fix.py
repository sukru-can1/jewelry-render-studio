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


def camera_only_backdrop(*, color: list[float], y: float = 4.2, z: float = 2.6) -> dict:
    return {
        "name": "camera_only_soft_gray_backdrop",
        "position": [0.0, y, z],
        "rotation_degrees": [90, 0, 0],
        "size": [28.0, 16.0],
        "color": color,
        "visible_to_camera": True,
        "visible_to_shadow": False,
        "visible_to_diffuse": False,
        "visible_to_glossy": False,
        "visible_to_transmission": False,
        "visible_to_volume_scatter": False,
    }


def shadow_safe_cards(cards: list[dict]) -> list[dict]:
    safe = []
    for card in cards:
        if card.get("visible_to_camera", False):
            continue
        item = copy.deepcopy(card)
        item["visible_to_shadow"] = False
        item.setdefault("visible_to_diffuse", False)
        safe.append(item)
    return safe


def tune_cards(cards: list[dict], *, lower_color: list[float]) -> None:
    for card in cards:
        name = card.get("name", "")
        if name == "glossy_only_lower_stone_gray_reflector":
            card["position"] = [0.0, -1.14, 0.3]
            card["rotation_degrees"] = [72, 0, 0]
            card["size"] = [1.5, 0.32]
            card["color"] = lower_color
            card["visible_to_camera"] = False
            card["visible_to_shadow"] = False
            card["visible_to_diffuse"] = False
            card["visible_to_glossy"] = True
            card["visible_to_transmission"] = False
            card["visible_to_volume_scatter"] = False
        elif name in {"front_low_black_reflection", "left_side_dark_mirror", "right_side_dark_mirror"}:
            card["visible_to_shadow"] = False
            card["visible_to_diffuse"] = False
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = [0.085, 0.088, 0.096, 1.0]
            card["visible_to_shadow"] = False
            card["visible_to_diffuse"] = False


def tune_center(recipe: dict, *, value: float, glass_mix: float, diffuse: list[float]) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "diamond_round_11" not in tokens:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = diffuse


def tune_metal(recipe: dict, *, roughness: float, color: list[float], specular: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "prong" in tokens or "object_" in tokens:
            adjust = rule.setdefault("source_material_adjust", {})
            adjust["base_color"] = color
            adjust["diffuse_color"] = color
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular


def product_mask(*, stone_brightness: float, blend: float, extra_bottom: bool = False) -> dict:
    regions = [[0.355, 0.635, 0.645, 0.842]]
    if extra_bottom:
        regions.append([0.24, 0.72, 0.76, 0.91])
    return {
        "enabled": True,
        "regions_norm": regions,
        "blur_radius": 0.3,
        "brightness": stone_brightness,
        "contrast": 1.075,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 26,
        "mask_shape": "ellipse",
    }


def contact_shadow(*, alpha: float, size: list[float], y: float = -0.08) -> list[dict]:
    return [
        {
            "name": "product_soft_contact_shadow",
            "position": [0.0, y, -0.216],
            "size": size,
            "rotation_degrees": 0,
            "color": [0.0, 0.0, 0.0],
            "alpha": alpha,
            "layers": 5,
            "spread": 0.72,
            "vertices": 128,
        }
    ]


VARIANTS = [
    {
        "name": "v165a_son2_low_camera_camera_only_backdrop",
        "render": {"samples": 760, "exposure": -0.18},
        "camera": {
            "position": [0.0, -5.12, 1.34],
            "target": [0.0, 0.0, 0.23],
            "focal_length": 86,
            "shift_y": 0.044,
        },
        "model": {"ground_clearance": 0.15, "target_size": 2.12},
        "world": {"color": [0.63, 0.63, 0.635], "strength": 0.003},
        "background": {"color": [0.655, 0.655, 0.66, 1.0], "plane_size": 70.0, "plane_z": -0.22},
        "postprocess": {
            "product": {"brightness": 0.928, "contrast": 1.054, "blend": 0.095},
            "side_soften": product_mask(stone_brightness=0.82, blend=0.14, extra_bottom=True),
        },
        "contact_shadows": contact_shadow(alpha=0.12, size=[2.6, 0.5]),
        "center": {"value": 0.535, "glass_mix": 0.175, "diffuse": [0.52, 0.56, 0.62, 1.0]},
        "metal": {"roughness": 0.245, "color": [0.285, 0.30, 0.33, 1.0], "specular": 0.52},
        "backdrop": camera_only_backdrop(color=[0.69, 0.69, 0.695, 1.0]),
        "lower_reflector": [0.105, 0.11, 0.12, 1.0],
    },
    {
        "name": "v165b_son2_lower_facet_angle_less_floor_bleed",
        "render": {"samples": 760, "exposure": -0.188},
        "camera": {
            "position": [0.0, -5.02, 1.22],
            "target": [0.0, 0.0, 0.2],
            "focal_length": 88,
            "shift_y": 0.052,
        },
        "model": {"ground_clearance": 0.18, "target_size": 2.08},
        "world": {"color": [0.615, 0.615, 0.62], "strength": 0.0025},
        "background": {"color": [0.64, 0.64, 0.645, 1.0], "plane_size": 70.0, "plane_z": -0.22},
        "postprocess": {
            "product": {"brightness": 0.922, "contrast": 1.062, "blend": 0.105},
            "side_soften": product_mask(stone_brightness=0.8, blend=0.16, extra_bottom=True),
        },
        "contact_shadows": contact_shadow(alpha=0.14, size=[2.8, 0.56], y=-0.06),
        "center": {"value": 0.515, "glass_mix": 0.185, "diffuse": [0.5, 0.54, 0.6, 1.0]},
        "metal": {"roughness": 0.27, "color": [0.27, 0.285, 0.315, 1.0], "specular": 0.48},
        "backdrop": camera_only_backdrop(color=[0.67, 0.67, 0.675, 1.0]),
        "lower_reflector": [0.085, 0.09, 0.10, 1.0],
    },
    {
        "name": "v165c_son2_catalog_balance_shadow_not_black",
        "render": {"samples": 760, "exposure": -0.172},
        "camera": {
            "position": [0.0, -5.2, 1.46],
            "target": [0.0, 0.0, 0.24],
            "focal_length": 84,
            "shift_y": 0.035,
        },
        "model": {"ground_clearance": 0.15, "target_size": 2.14},
        "world": {"color": [0.64, 0.64, 0.645], "strength": 0.003},
        "background": {"color": [0.66, 0.66, 0.665, 1.0], "plane_size": 70.0, "plane_z": -0.22},
        "postprocess": {
            "product": {"brightness": 0.934, "contrast": 1.052, "blend": 0.09},
            "side_soften": product_mask(stone_brightness=0.835, blend=0.12),
        },
        "contact_shadows": contact_shadow(alpha=0.105, size=[2.45, 0.46]),
        "center": {"value": 0.55, "glass_mix": 0.17, "diffuse": [0.535, 0.575, 0.635, 1.0]},
        "metal": {"roughness": 0.235, "color": [0.295, 0.31, 0.34, 1.0], "specular": 0.54},
        "backdrop": camera_only_backdrop(color=[0.705, 0.705, 0.71, 1.0]),
        "lower_reflector": [0.12, 0.125, 0.135, 1.0],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    cards = shadow_safe_cards(base.get("reflection_cards", []))
    for variant in VARIANTS:
        config = copy.deepcopy(variant)
        center = config.pop("center")
        metal = config.pop("metal")
        backdrop = config.pop("backdrop")
        lower_reflector = config.pop("lower_reflector")

        recipe = deep_merge(base, config)
        recipe["reflection_cards"] = copy.deepcopy(cards)
        tune_cards(recipe["reflection_cards"], lower_color=lower_reflector)
        recipe["reflection_cards"].append(backdrop)
        tune_center(recipe, **center)
        tune_metal(recipe, **metal)
        recipe["description"] = (
            "son2 v165: lower camera/facet-facing angle with a camera-only gray backdrop, "
            "non-shadow reflection cards, darker lower-stone control, and subtler contact shadow."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

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


def studio_background(*, shadow_alpha: int, floor_strength: float = 0.58) -> dict:
    return {
        "enabled": True,
        "top_color": [248, 248, 247],
        "floor_color": [239, 239, 237],
        "floor_start": 0.48,
        "floor_strength": floor_strength,
        "vignette": 6.0,
        "mask_cutoff": 0.35,
        "object_padding_px": 12,
        "object_feather": 3.0,
        "bright_object_keep": 0.2,
        "protect_feather": 1.2,
        "shadow_blur": 30.0,
        "shadows": [
            {"cx": 0.50, "cy": 0.825, "rx": 0.44, "ry": 0.055, "alpha": shadow_alpha},
            {"cx": 0.50, "cy": 0.858, "rx": 0.26, "ry": 0.032, "alpha": int(shadow_alpha * 0.45)},
        ],
    }


def camera_only_backdrop(color: list[float]) -> dict:
    return {
        "name": "camera_only_soft_gray_backdrop",
        "position": [0.0, 4.2, 2.6],
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
    result = []
    for card in cards:
        if card.get("visible_to_camera", False):
            continue
        item = copy.deepcopy(card)
        item["visible_to_shadow"] = False
        item.setdefault("visible_to_diffuse", False)
        name = item.get("name", "")
        if name in {"front_low_black_reflection", "left_side_dark_mirror", "right_side_dark_mirror"}:
            item["color"] = [0.028, 0.03, 0.035, 1.0]
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            item["color"] = [0.13, 0.135, 0.145, 1.0]
        elif name == "upper_facet_dark_card":
            item["color"] = [0.03, 0.032, 0.038, 1.0]
            item["position"] = [-0.08, -0.74, 2.04]
            item["size"] = [4.2, 1.05]
        elif name == "glossy_only_lower_stone_gray_reflector":
            item["position"] = [0.0, -1.14, 0.3]
            item["rotation_degrees"] = [72, 0, 0]
            item["size"] = [1.45, 0.3]
            item["color"] = [0.095, 0.1, 0.11, 1.0]
            item["visible_to_glossy"] = True
            item["visible_to_transmission"] = False
            item["visible_to_volume_scatter"] = False
        result.append(item)
    return result


def tune_center(recipe: dict, *, value: float, glass_mix: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "diamond_round_11" not in tokens:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = [0.53, 0.57, 0.64, 1.0]


def tune_metal(recipe: dict, *, roughness: float, color: list[float], specular: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "prong" in tokens or "object_" in tokens:
            adjust = rule.setdefault("source_material_adjust", {})
            adjust["base_color"] = color
            adjust["diffuse_color"] = color
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular


def lower_stone_mask(*, brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.35, 0.63, 0.65, 0.85], [0.24, 0.72, 0.76, 0.92]],
        "blur_radius": 0.28,
        "brightness": brightness,
        "contrast": 1.08,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 24,
        "mask_shape": "ellipse",
    }


def contact_shadow(*, alpha: float, size: list[float], y: float = -0.06) -> list[dict]:
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
        "name": "v166a_son2_post_bg_balanced_low_camera",
        "render": {"samples": 780, "exposure": -0.168},
        "camera": {"position": [0.0, -5.02, 1.22], "target": [0.0, 0.0, 0.2], "focal_length": 88, "shift_y": 0.052},
        "model": {"ground_clearance": 0.18, "target_size": 2.08},
        "world": {"color": [0.64, 0.64, 0.645], "strength": 0.003},
        "background": {"color": [0.66, 0.66, 0.665, 1.0], "plane_size": 70.0, "plane_z": -0.22},
        "postprocess": {
            "studio_background": studio_background(shadow_alpha=26, floor_strength=0.55),
            "product": {"brightness": 0.94, "contrast": 1.048, "blend": 0.085},
            "side_soften": lower_stone_mask(brightness=0.81, blend=0.15),
            "center_stone": {"brightness": 0.985, "contrast": 1.17, "sharpness": 1.12, "blend": 0.25, "detail_amount": 0.11},
        },
        "contact_shadows": contact_shadow(alpha=0.09, size=[2.65, 0.5]),
        "center": {"value": 0.545, "glass_mix": 0.17},
        "metal": {"roughness": 0.235, "color": [0.31, 0.325, 0.355, 1.0], "specular": 0.55},
        "backdrop": camera_only_backdrop([0.70, 0.70, 0.705, 1.0]),
    },
    {
        "name": "v166b_son2_post_bg_cleaner_metal_from_v163",
        "render": {"samples": 780, "exposure": -0.165},
        "camera": {"position": [0.0, -5.15, 1.45], "target": [0.0, 0.0, 0.24], "focal_length": 84, "shift_y": 0.033},
        "model": {"ground_clearance": 0.16, "target_size": 2.12},
        "world": {"color": [0.65, 0.65, 0.655], "strength": 0.0032},
        "background": {"color": [0.67, 0.67, 0.675, 1.0], "plane_size": 70.0, "plane_z": -0.22},
        "postprocess": {
            "studio_background": studio_background(shadow_alpha=22, floor_strength=0.5),
            "product": {"brightness": 0.948, "contrast": 1.042, "blend": 0.08},
            "side_soften": lower_stone_mask(brightness=0.84, blend=0.12),
            "center_stone": {"brightness": 0.99, "contrast": 1.15, "sharpness": 1.1, "blend": 0.22, "detail_amount": 0.09},
        },
        "contact_shadows": contact_shadow(alpha=0.075, size=[2.45, 0.46], y=-0.08),
        "center": {"value": 0.565, "glass_mix": 0.155},
        "metal": {"roughness": 0.215, "color": [0.325, 0.34, 0.37, 1.0], "specular": 0.58},
        "backdrop": camera_only_backdrop([0.715, 0.715, 0.72, 1.0]),
    },
    {
        "name": "v166c_son2_post_bg_crisper_diamond",
        "render": {"samples": 820, "exposure": -0.172},
        "camera": {"position": [0.0, -5.08, 1.3], "target": [0.0, 0.0, 0.22], "focal_length": 86, "shift_y": 0.047},
        "model": {"ground_clearance": 0.165, "target_size": 2.1},
        "world": {"color": [0.635, 0.635, 0.64], "strength": 0.0028},
        "background": {"color": [0.655, 0.655, 0.66, 1.0], "plane_size": 70.0, "plane_z": -0.22},
        "postprocess": {
            "studio_background": studio_background(shadow_alpha=28, floor_strength=0.6),
            "product": {"brightness": 0.936, "contrast": 1.055, "blend": 0.09},
            "side_soften": lower_stone_mask(brightness=0.79, blend=0.17),
            "center_stone": {"brightness": 0.982, "contrast": 1.2, "sharpness": 1.14, "blend": 0.27, "detail_amount": 0.13},
        },
        "contact_shadows": contact_shadow(alpha=0.1, size=[2.55, 0.5]),
        "center": {"value": 0.535, "glass_mix": 0.18},
        "metal": {"roughness": 0.255, "color": [0.295, 0.31, 0.34, 1.0], "specular": 0.52},
        "backdrop": camera_only_backdrop([0.695, 0.695, 0.70, 1.0]),
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
        recipe = deep_merge(base, config)
        recipe["reflection_cards"] = copy.deepcopy(cards)
        recipe["reflection_cards"].append(backdrop)
        tune_center(recipe, **center)
        tune_metal(recipe, **metal)
        recipe["description"] = (
            "son2 v166: patched studio background post pass, reduced black-card strength for realistic white gold, "
            "lower-camera facet view, and lower-stone floor-bleed control."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

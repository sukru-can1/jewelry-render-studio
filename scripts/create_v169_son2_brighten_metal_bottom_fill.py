from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v168b_son2_brighter_white_gold_clean_bottom.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def tune_metal(recipe: dict, *, color: list[float], roughness: float, specular: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "prong" in tokens or "object_" in tokens:
            adjust = rule.setdefault("source_material_adjust", {})
            adjust["base_color"] = color
            adjust["diffuse_color"] = color
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular


def make_cards(cards: list[dict], *, card_gray: float, lower_gray: float) -> list[dict]:
    result = []
    for card in copy.deepcopy(cards):
        name = card.get("name", "")
        if name == "front_low_black_reflection":
            continue
        if name in {"left_side_dark_mirror", "right_side_dark_mirror"}:
            card["color"] = [card_gray, card_gray, card_gray + 0.01, 1.0]
            card["size"] = [2.15, 2.35]
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = [0.34, 0.345, 0.355, 1.0]
        elif name == "upper_facet_dark_card":
            card["color"] = [0.075, 0.078, 0.085, 1.0]
            card["size"] = [3.7, 0.86]
        elif name == "glossy_only_lower_stone_gray_reflector":
            card["color"] = [lower_gray, lower_gray + 0.005, lower_gray + 0.015, 1.0]
            card["size"] = [0.95, 0.18]
            card["position"] = [0.0, -1.25, 0.38]
        result.append(card)
    return result


def lower_setting_lift(*, brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.30, 0.765, 0.70, 0.935]],
        "blur_radius": 0.12,
        "brightness": brightness,
        "contrast": 0.96,
        "saturation": 0.96,
        "blend": blend,
        "mask_feather": 20,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v169a_son2_no_black_cards_front_fill",
        "render": {"samples": 780, "exposure": -0.128},
        "model": {"ground_clearance": 0.215},
        "world": {"strength": 0.0035},
        "postprocess": {
            "product": {"brightness": 0.985, "contrast": 1.012, "blend": 0.045},
            "side_soften": {"enabled": False},
            "final_regions": lower_setting_lift(brightness=1.16, blend=0.22),
            "center_stone": {"brightness": 0.988, "contrast": 1.11, "sharpness": 1.09, "blend": 0.18, "detail_amount": 0.08},
            "studio_background": {
                "shadows": [
                    {"cx": 0.50, "cy": 0.835, "rx": 0.40, "ry": 0.044, "alpha": 10},
                    {"cx": 0.50, "cy": 0.862, "rx": 0.22, "ry": 0.026, "alpha": 4},
                ],
                "bright_object_keep": 0.72,
                "floor_strength": 0.20,
            },
        },
        "contact_shadows": [],
        "metal": {"color": [0.54, 0.55, 0.575, 1.0], "roughness": 0.22, "specular": 0.60},
        "card_gray": 0.24,
        "lower_gray": 0.30,
        "extra_lights": [
            {
                "name": "front_lower_metal_fill",
                "type": "AREA",
                "position": [0.0, -2.35, 0.72],
                "rotation_degrees": [78, 0, 0],
                "size": 2.1,
                "size_y": 0.8,
                "power": 28,
            }
        ],
    },
    {
        "name": "v169b_son2_white_gold_no_lower_shadow",
        "render": {"samples": 780, "exposure": -0.12},
        "model": {"ground_clearance": 0.235},
        "world": {"strength": 0.004},
        "postprocess": {
            "product": {"brightness": 0.99, "contrast": 1.008, "blend": 0.04},
            "side_soften": {"enabled": False},
            "final_regions": lower_setting_lift(brightness=1.22, blend=0.24),
            "center_stone": {"brightness": 0.99, "contrast": 1.10, "sharpness": 1.08, "blend": 0.16, "detail_amount": 0.07},
            "studio_background": {
                "shadows": [
                    {"cx": 0.50, "cy": 0.84, "rx": 0.38, "ry": 0.04, "alpha": 7},
                    {"cx": 0.50, "cy": 0.864, "rx": 0.20, "ry": 0.024, "alpha": 3},
                ],
                "bright_object_keep": 0.76,
                "floor_strength": 0.18,
            },
        },
        "contact_shadows": [],
        "metal": {"color": [0.60, 0.61, 0.635, 1.0], "roughness": 0.24, "specular": 0.56},
        "card_gray": 0.30,
        "lower_gray": 0.36,
        "extra_lights": [
            {
                "name": "front_lower_metal_fill",
                "type": "AREA",
                "position": [0.0, -2.25, 0.78],
                "rotation_degrees": [76, 0, 0],
                "size": 2.4,
                "size_y": 0.9,
                "power": 36,
            },
            {
                "name": "soft_front_table_fill",
                "type": "AREA",
                "position": [0.0, -3.0, 1.45],
                "rotation_degrees": [68, 0, 0],
                "size": 3.0,
                "size_y": 1.1,
                "power": 12,
            },
        ],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        config = copy.deepcopy(variant)
        metal = config.pop("metal")
        card_gray = config.pop("card_gray")
        lower_gray = config.pop("lower_gray")
        extra_lights = config.pop("extra_lights")
        recipe = deep_merge(base, config)
        tune_metal(recipe, **metal)
        recipe["reflection_cards"] = make_cards(recipe.get("reflection_cards", []), card_gray=card_gray, lower_gray=lower_gray)
        recipe["lights"] = recipe.get("lights", []) + extra_lights
        recipe["description"] = (
            "son2 v169: removes black front reflection and contact shadow, adds front lower fill, "
            "and brightens lower setting to fix dark/malformed metal."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v169b_son2_white_gold_no_lower_shadow.json"


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


def neutralize_cards(recipe: dict, *, gray: float, lower: float, upper: float) -> None:
    kept = []
    for card in recipe.get("reflection_cards", []):
        name = card.get("name", "")
        if name == "front_low_black_reflection":
            continue
        if name in {"left_side_dark_mirror", "right_side_dark_mirror"}:
            card["color"] = [gray, gray, gray + 0.01, 1.0]
            card["size"] = [2.1, 2.2]
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = [0.36, 0.365, 0.375, 1.0]
        elif name == "upper_facet_dark_card":
            card["color"] = [upper, upper + 0.003, upper + 0.01, 1.0]
            card["size"] = [3.0, 0.65]
            card["position"] = [-0.08, -0.86, 2.12]
        elif name == "glossy_only_lower_stone_gray_reflector":
            card["color"] = [lower, lower + 0.005, lower + 0.015, 1.0]
            card["size"] = [0.8, 0.16]
            card["position"] = [0.0, -1.28, 0.42]
        kept.append(card)
    recipe["reflection_cards"] = kept


def studio_bg(*, shadow: int) -> dict:
    return {
        "enabled": True,
        "top_color": [248, 248, 247],
        "floor_color": [241, 241, 239],
        "floor_start": 0.12,
        "floor_strength": 0.20,
        "vignette": 4.0,
        "mask_cutoff": 0.35,
        "object_padding_px": 12,
        "object_feather": 3.0,
        "bright_object_keep": 0.70,
        "protect_feather": 1.2,
        "fallback_product_bounds_norm": [0.015, 0.49, 0.985, 0.965],
        "shadow_blur": 30.0,
        "shadows": [
            {"cx": 0.50, "cy": 0.838, "rx": 0.40, "ry": 0.042, "alpha": shadow},
            {"cx": 0.50, "cy": 0.864, "rx": 0.21, "ry": 0.024, "alpha": int(shadow * 0.35)},
        ],
    }


VARIANTS = [
    {
        "name": "v170a_son2_silver_metal_higher_camera",
        "render": {"samples": 780, "exposure": -0.17},
        "camera": {"position": [0.0, -5.12, 1.5], "target": [0.0, 0.0, 0.24], "focal_length": 85, "shift_y": 0.032},
        "model": {"ground_clearance": 0.19},
        "world": {"strength": 0.005},
        "postprocess": {
            "studio_background": studio_bg(shadow=10),
            "product": {"brightness": 0.96, "contrast": 1.028, "blend": 0.055},
            "side_soften": {"enabled": False},
            "final_regions": {"enabled": False},
            "center_stone": {"brightness": 0.972, "contrast": 1.18, "sharpness": 1.12, "blend": 0.22, "detail_amount": 0.10},
        },
        "contact_shadows": [],
        "metal": {"color": [0.50, 0.515, 0.545, 1.0], "roughness": 0.23, "specular": 0.58},
        "cards": {"gray": 0.34, "lower": 0.26, "upper": 0.13},
        "extra_lights": [
            {
                "name": "front_lower_metal_fill",
                "type": "AREA",
                "position": [0.0, -2.45, 0.82],
                "rotation_degrees": [76, 0, 0],
                "size": 2.0,
                "size_y": 0.75,
                "power": 14,
            }
        ],
    },
    {
        "name": "v170b_son2_silver_metal_cleaner_diamond",
        "render": {"samples": 780, "exposure": -0.185},
        "camera": {"position": [0.0, -5.18, 1.62], "target": [0.0, 0.0, 0.25], "focal_length": 84, "shift_y": 0.024},
        "model": {"ground_clearance": 0.175},
        "world": {"strength": 0.0045},
        "postprocess": {
            "studio_background": studio_bg(shadow=12),
            "product": {"brightness": 0.952, "contrast": 1.035, "blend": 0.065},
            "side_soften": {"enabled": False},
            "final_regions": {"enabled": False},
            "center_stone": {"brightness": 0.968, "contrast": 1.21, "sharpness": 1.13, "blend": 0.24, "detail_amount": 0.12},
        },
        "contact_shadows": [],
        "metal": {"color": [0.47, 0.485, 0.515, 1.0], "roughness": 0.24, "specular": 0.56},
        "cards": {"gray": 0.30, "lower": 0.22, "upper": 0.10},
        "extra_lights": [
            {
                "name": "front_lower_metal_fill",
                "type": "AREA",
                "position": [0.0, -2.55, 0.86],
                "rotation_degrees": [76, 0, 0],
                "size": 1.8,
                "size_y": 0.7,
                "power": 10,
            }
        ],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        config = copy.deepcopy(variant)
        metal = config.pop("metal")
        cards = config.pop("cards")
        extra_lights = config.pop("extra_lights")
        recipe = deep_merge(base, config)
        tune_metal(recipe, **metal)
        neutralize_cards(recipe, **cards)
        recipe["lights"] = recipe.get("lights", []) + extra_lights
        recipe["description"] = (
            "son2 v170: higher camera and neutral reflection cards to remove black rear band, "
            "with less front fill so the diamond does not blow out."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

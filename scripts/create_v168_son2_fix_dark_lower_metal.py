from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v167b_son2_smooth_bg_lighter_metal_lower_stone.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def center_only_lower_stone(*, brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.385, 0.665, 0.615, 0.84]],
        "blur_radius": 0.08,
        "brightness": brightness,
        "contrast": 1.08,
        "saturation": 0.92,
        "blend": blend,
        "mask_feather": 18,
        "mask_shape": "ellipse",
    }


def soften_background_shadow(*, alpha: int) -> dict:
    return {
        "enabled": True,
        "top_color": [248, 248, 247],
        "floor_color": [241, 241, 239],
        "floor_start": 0.14,
        "floor_strength": 0.22,
        "vignette": 4.0,
        "mask_cutoff": 0.35,
        "object_padding_px": 12,
        "object_feather": 3.0,
        "bright_object_keep": 0.64,
        "protect_feather": 1.2,
        "fallback_product_bounds_norm": [0.015, 0.49, 0.985, 0.965],
        "shadow_blur": 30.0,
        "shadows": [
            {"cx": 0.50, "cy": 0.832, "rx": 0.42, "ry": 0.048, "alpha": alpha},
            {"cx": 0.50, "cy": 0.862, "rx": 0.24, "ry": 0.028, "alpha": int(alpha * 0.38)},
        ],
    }


def tune_cards(recipe: dict, *, dark: list[float], shoulder: list[float], lower: list[float], front_scale: list[float]) -> None:
    for card in recipe.get("reflection_cards", []):
        name = card.get("name", "")
        if name == "front_low_black_reflection":
            card["color"] = front_scale
            card["size"] = [4.8, 0.48]
            card["position"] = [0.0, -2.35, 0.42]
        elif name in {"left_side_dark_mirror", "right_side_dark_mirror"}:
            card["color"] = dark
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = shoulder
        elif name == "upper_facet_dark_card":
            card["color"] = [0.055, 0.058, 0.066, 1.0]
        elif name == "glossy_only_lower_stone_gray_reflector":
            card["color"] = lower
            card["position"] = [0.0, -1.2, 0.34]
            card["size"] = [1.15, 0.22]


def tune_metal(recipe: dict, *, color: list[float], roughness: float, specular: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "prong" in tokens or "object_" in tokens:
            adjust = rule.setdefault("source_material_adjust", {})
            adjust["base_color"] = color
            adjust["diffuse_color"] = color
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular


VARIANTS = [
    {
        "name": "v168a_son2_fix_lower_metal_no_malformed_mask",
        "render": {"samples": 780, "exposure": -0.145},
        "model": {"ground_clearance": 0.185},
        "postprocess": {
            "studio_background": soften_background_shadow(alpha=16),
            "product": {"brightness": 0.965, "contrast": 1.025, "blend": 0.055},
            "side_soften": center_only_lower_stone(brightness=0.88, blend=0.08),
            "final_regions": {"enabled": False},
        },
        "contact_shadows": [
            {
                "name": "product_soft_contact_shadow",
                "position": [0.0, -0.055, -0.216],
                "size": [2.45, 0.44],
                "rotation_degrees": 0,
                "color": [0.0, 0.0, 0.0],
                "alpha": 0.045,
                "layers": 5,
                "spread": 0.72,
                "vertices": 128,
            }
        ],
        "metal": {"color": [0.43, 0.445, 0.475, 1.0], "roughness": 0.19, "specular": 0.64},
        "cards": {
            "dark": [0.12, 0.125, 0.135, 1.0],
            "shoulder": [0.24, 0.245, 0.255, 1.0],
            "lower": [0.18, 0.185, 0.195, 1.0],
            "front_scale": [0.20, 0.205, 0.215, 1.0],
        },
    },
    {
        "name": "v168b_son2_brighter_white_gold_clean_bottom",
        "render": {"samples": 780, "exposure": -0.135},
        "model": {"ground_clearance": 0.20},
        "postprocess": {
            "studio_background": soften_background_shadow(alpha=13),
            "product": {"brightness": 0.972, "contrast": 1.018, "blend": 0.05},
            "side_soften": {"enabled": False},
            "final_regions": {"enabled": False},
            "center_stone": {"brightness": 0.99, "contrast": 1.12, "sharpness": 1.1, "blend": 0.2, "detail_amount": 0.09},
        },
        "contact_shadows": [
            {
                "name": "product_soft_contact_shadow",
                "position": [0.0, -0.055, -0.216],
                "size": [2.35, 0.4],
                "rotation_degrees": 0,
                "color": [0.0, 0.0, 0.0],
                "alpha": 0.035,
                "layers": 5,
                "spread": 0.65,
                "vertices": 128,
            }
        ],
        "metal": {"color": [0.465, 0.48, 0.51, 1.0], "roughness": 0.17, "specular": 0.68},
        "cards": {
            "dark": [0.16, 0.165, 0.175, 1.0],
            "shoulder": [0.285, 0.29, 0.30, 1.0],
            "lower": [0.235, 0.24, 0.25, 1.0],
            "front_scale": [0.28, 0.285, 0.295, 1.0],
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        config = copy.deepcopy(variant)
        metal = config.pop("metal")
        cards = config.pop("cards")
        recipe = deep_merge(base, config)
        tune_metal(recipe, **metal)
        tune_cards(recipe, **cards)
        recipe["description"] = (
            "son2 v168: fixes lower setting darkness/malformed look by reducing black lower reflection, "
            "weakening contact shadows, lifting white-gold material, and avoiding broad lower-prong post masks."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

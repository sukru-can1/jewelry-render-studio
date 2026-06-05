from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v171a_son2_recover_silver_shank_clean_bottom.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def tune_materials(recipe: dict, *, metal: list[float], roughness: float, specular: float, center_value: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        adjust = rule.setdefault("source_material_adjust", {})
        if "prong" in tokens or "object_" in tokens:
            adjust["base_color"] = metal
            adjust["diffuse_color"] = metal
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular
        elif "diamond_round_11" in tokens:
            adjust["hsv_value_scale"] = center_value
            adjust["glass_color_mix"] = 0.15
        elif "diamond_round" in tokens:
            adjust["hsv_value_scale"] = 0.64
            adjust["glass_color_mix"] = 0.11


def tune_cards(recipe: dict, *, front: float, side: float, shoulder: float, lower: float, upper: float) -> None:
    for card in recipe.get("reflection_cards", []):
        name = card.get("name", "")
        if name == "front_low_black_reflection":
            card["color"] = [front, front + 0.003, front + 0.01, 1.0]
            card["size"] = [4.2, 0.42]
            card["position"] = [0.0, -2.32, 0.38]
        elif name in {"left_side_dark_mirror", "right_side_dark_mirror"}:
            card["color"] = [side, side + 0.003, side + 0.01, 1.0]
            card["size"] = [2.25, 2.45]
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = [shoulder, shoulder + 0.005, shoulder + 0.015, 1.0]
        elif name == "upper_facet_dark_card":
            card["color"] = [upper, upper + 0.003, upper + 0.01, 1.0]
            card["size"] = [3.5, 0.9]
        elif name == "glossy_only_lower_stone_gray_reflector":
            card["color"] = [lower, lower + 0.005, lower + 0.015, 1.0]
            card["size"] = [1.0, 0.18]
            card["position"] = [0.0, -1.25, 0.38]


def lower_center_only(*, brightness: float, blend: float, contrast: float = 1.1) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.405, 0.685, 0.595, 0.835]],
        "blur_radius": 0.04,
        "brightness": brightness,
        "contrast": contrast,
        "saturation": 0.92,
        "blend": blend,
        "mask_feather": 18,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v172a_son2_v171_diamond_contrast_safe_bottom",
        "render": {"samples": 820, "exposure": -0.178},
        "postprocess": {
            "product": {"brightness": 0.948, "contrast": 1.045, "blend": 0.07},
            "center_stone": {"brightness": 0.968, "contrast": 1.22, "sharpness": 1.13, "blend": 0.25, "detail_amount": 0.12},
            "final_regions": lower_center_only(brightness=0.82, blend=0.12, contrast=1.16),
        },
        "materials": {"metal": [0.38, 0.395, 0.425, 1.0], "roughness": 0.2, "specular": 0.58, "center_value": 0.545},
        "cards": {"front": 0.065, "side": 0.052, "shoulder": 0.17, "lower": 0.115, "upper": 0.032},
    },
    {
        "name": "v172b_son2_v171_silver_metal_crisper_edges",
        "render": {"samples": 820, "exposure": -0.172},
        "postprocess": {
            "product": {"brightness": 0.955, "contrast": 1.04, "blend": 0.068},
            "center_stone": {"brightness": 0.972, "contrast": 1.18, "sharpness": 1.11, "blend": 0.22, "detail_amount": 0.1},
            "final_regions": {"enabled": False},
        },
        "materials": {"metal": [0.405, 0.42, 0.45, 1.0], "roughness": 0.19, "specular": 0.6, "center_value": 0.555},
        "cards": {"front": 0.085, "side": 0.07, "shoulder": 0.19, "lower": 0.135, "upper": 0.04},
    },
    {
        "name": "v172c_son2_v171_less_milky_floor_clean_shadow",
        "render": {"samples": 820, "exposure": -0.185},
        "background": {"color": [0.64, 0.64, 0.645, 1.0]},
        "postprocess": {
            "studio_background": {
                "floor_strength": 0.20,
                "bright_object_keep": 0.54,
                "shadows": [
                    {"cx": 0.50, "cy": 0.83, "rx": 0.40, "ry": 0.046, "alpha": 12},
                    {"cx": 0.50, "cy": 0.858, "rx": 0.22, "ry": 0.026, "alpha": 5},
                ],
            },
            "product": {"brightness": 0.944, "contrast": 1.05, "blend": 0.072},
            "center_stone": {"brightness": 0.965, "contrast": 1.2, "sharpness": 1.12, "blend": 0.24, "detail_amount": 0.11},
            "final_regions": lower_center_only(brightness=0.78, blend=0.10, contrast=1.18),
        },
        "materials": {"metal": [0.39, 0.405, 0.435, 1.0], "roughness": 0.205, "specular": 0.58, "center_value": 0.535},
        "cards": {"front": 0.06, "side": 0.055, "shoulder": 0.17, "lower": 0.10, "upper": 0.035},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        config = copy.deepcopy(variant)
        materials = config.pop("materials")
        cards = config.pop("cards")
        recipe = deep_merge(base, config)
        tune_materials(recipe, **materials)
        tune_cards(recipe, **cards)
        recipe["description"] = (
            "son2 v172: refine from v171 with safe center diamond contrast, preserved silver shank, "
            "and no broad lower-prong masks."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

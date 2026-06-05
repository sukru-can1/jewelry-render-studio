from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v166c_son2_post_bg_crisper_diamond.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def final_lower_stone(*, brightness: float, blend: float, contrast: float = 1.15) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.345, 0.655, 0.655, 0.875]],
        "blur_radius": 0.18,
        "brightness": brightness,
        "contrast": contrast,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 22,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v167a_son2_smooth_bg_lower_stone_control",
        "render": {"samples": 820, "exposure": -0.172},
        "postprocess": {
            "studio_background": {
                "enabled": True,
                "top_color": [248, 248, 247],
                "floor_color": [239, 239, 237],
                "floor_start": 0.18,
                "floor_strength": 0.30,
                "vignette": 5.0,
                "mask_cutoff": 0.35,
                "object_padding_px": 12,
                "object_feather": 3.0,
                "bright_object_keep": 0.55,
                "protect_feather": 1.2,
                "fallback_product_bounds_norm": [0.02, 0.49, 0.98, 0.96],
                "shadow_blur": 30.0,
                "shadows": [
                    {"cx": 0.50, "cy": 0.825, "rx": 0.44, "ry": 0.055, "alpha": 24},
                    {"cx": 0.50, "cy": 0.858, "rx": 0.26, "ry": 0.032, "alpha": 11},
                ],
            },
            "center_stone": {"brightness": 0.978, "contrast": 1.18, "sharpness": 1.13, "blend": 0.24, "detail_amount": 0.12},
            "final_regions": final_lower_stone(brightness=0.70, blend=0.25, contrast=1.18),
        },
    },
    {
        "name": "v167b_son2_smooth_bg_lighter_metal_lower_stone",
        "render": {"samples": 820, "exposure": -0.166},
        "postprocess": {
            "studio_background": {
                "enabled": True,
                "top_color": [248, 248, 247],
                "floor_color": [240, 240, 238],
                "floor_start": 0.16,
                "floor_strength": 0.26,
                "vignette": 4.5,
                "mask_cutoff": 0.35,
                "object_padding_px": 12,
                "object_feather": 3.0,
                "bright_object_keep": 0.58,
                "protect_feather": 1.2,
                "fallback_product_bounds_norm": [0.02, 0.49, 0.98, 0.96],
                "shadow_blur": 28.0,
                "shadows": [
                    {"cx": 0.50, "cy": 0.825, "rx": 0.43, "ry": 0.052, "alpha": 21},
                    {"cx": 0.50, "cy": 0.858, "rx": 0.25, "ry": 0.030, "alpha": 9},
                ],
            },
            "product": {"brightness": 0.944, "contrast": 1.045, "blend": 0.082},
            "center_stone": {"brightness": 0.982, "contrast": 1.17, "sharpness": 1.12, "blend": 0.23, "detail_amount": 0.11},
            "final_regions": final_lower_stone(brightness=0.74, blend=0.22, contrast=1.15),
        },
        "material_tune": {
            "metal_color": [0.325, 0.34, 0.37, 1.0],
            "metal_roughness": 0.225,
            "metal_specular": 0.56,
            "dark_card": [0.045, 0.047, 0.052, 1.0],
            "shoulder_card": [0.16, 0.165, 0.175, 1.0],
            "upper_card": [0.045, 0.047, 0.055, 1.0],
        },
    },
]


def tune_materials(recipe: dict, tune: dict) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "prong" in tokens or "object_" in tokens:
            adjust = rule.setdefault("source_material_adjust", {})
            adjust["base_color"] = tune["metal_color"]
            adjust["diffuse_color"] = tune["metal_color"]
            adjust["roughness"] = tune["metal_roughness"]
            adjust["specular_ior_level"] = tune["metal_specular"]

    for card in recipe.get("reflection_cards", []):
        name = card.get("name", "")
        if name in {"front_low_black_reflection", "left_side_dark_mirror", "right_side_dark_mirror"}:
            card["color"] = tune["dark_card"]
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = tune["shoulder_card"]
        elif name == "upper_facet_dark_card":
            card["color"] = tune["upper_card"]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        config = copy.deepcopy(variant)
        tune = config.pop("material_tune", None)
        recipe = deep_merge(base, config)
        if tune:
            tune_materials(recipe, tune)
        recipe["description"] = (
            "son2 v167: smoothed studio background postprocess, filtered full-frame refractive bounds, "
            "and final lower-stone darkening after center-stone enhancement."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

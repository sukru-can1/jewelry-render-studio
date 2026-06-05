from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v157a_son2_stone_natural_crisper_no_overlay.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def tune_materials(recipe: dict, *, metal_base: list[float], metal_roughness: float, specular: float, center_value: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        adjust = rule.setdefault("source_material_adjust", {})
        if "diamond_round_11" in tokens:
            adjust["hsv_value_scale"] = center_value
            adjust["hsv_value_max"] = 0.94
            adjust["saturation_scale"] = 0.84
            adjust["glass_color_mix"] = 0.18
            adjust["diffuse_color"] = [0.52, 0.56, 0.62, 1.0]
        elif "diamond_round" in tokens:
            adjust["hsv_value_scale"] = min(0.63, float(adjust.get("hsv_value_scale", 0.68)))
            adjust["hsv_value_max"] = 0.98
            adjust["saturation_scale"] = 0.84
        elif "prong" in tokens or "object_" in tokens:
            adjust["base_color"] = metal_base
            adjust["diffuse_color"] = metal_base
            adjust["roughness"] = metal_roughness
            adjust["specular_ior_level"] = specular


def center_post(*, contrast: float, brightness: float, blend: float, detail: float) -> dict:
    return {
        "enabled": True,
        "object_contains": ["diamond_round_11"],
        "padding_px": 0,
        "autocontrast_cutoff": 0.15,
        "contrast": contrast,
        "brightness": brightness,
        "saturation": 0.91,
        "sharpness": 1.09,
        "unsharp_radius": 0.6,
        "unsharp_percent": 64,
        "unsharp_threshold": 2,
        "detail_amount": detail,
        "detail_radius": 2.0,
        "detail_threshold": 1,
        "blend": blend,
        "mask_feather": 10,
    }


LESS_FLASH_LIGHTS = [
    {
        "name": "large_top_softbox",
        "type": "AREA",
        "position": [0.0, -1.15, 3.65],
        "rotation_degrees": [58, 0, 0],
        "size": 3.4,
        "size_y": 3.0,
        "power": 58,
    },
    {
        "name": "right_rim_strip",
        "type": "AREA",
        "position": [2.2, -0.12, 1.5],
        "rotation_degrees": [76, 0, 48],
        "size": 0.82,
        "size_y": 2.0,
        "power": 220,
    },
    {
        "name": "left_soft_strip",
        "type": "AREA",
        "position": [-2.45, -2.05, 1.05],
        "rotation_degrees": [72, 0, -36],
        "size": 1.0,
        "size_y": 1.8,
        "power": 4,
    },
    {"name": "diamond_pin_1", "type": "POINT", "position": [-0.45, -0.9, 1.35], "power": 430, "shadow_soft_size": 0.008},
    {"name": "diamond_pin_2", "type": "POINT", "position": [0.58, -1.08, 1.55], "power": 350, "shadow_soft_size": 0.008},
]


def lower_stone_mask(*, brightness: float, contrast: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.355, 0.635, 0.645, 0.842]],
        "blur_radius": 0.35,
        "brightness": brightness,
        "contrast": contrast,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 24,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v159a_son2_less_flash_render_only",
        "render": {"samples": 560, "exposure": -0.19},
        "world": {"color": [0.62, 0.62, 0.625], "strength": 0.004},
        "background": {"color": [0.62, 0.62, 0.625, 1.0]},
        "lights": LESS_FLASH_LIGHTS,
        "postprocess": {
            "product": {"brightness": 0.93, "contrast": 1.06, "blend": 0.12},
            "center_stone": center_post(contrast=1.12, brightness=0.965, blend=0.2, detail=0.08),
            "diamond_facets": {"enabled": False},
        },
        "material_tuning": {
            "metal_base": [0.285, 0.3, 0.33, 1.0],
            "metal_roughness": 0.22,
            "specular": 0.58,
            "center_value": 0.52,
        },
    },
    {
        "name": "v159b_son2_lower_stone_tamed",
        "render": {"samples": 560, "exposure": -0.185},
        "world": {"color": [0.64, 0.64, 0.645], "strength": 0.004},
        "background": {"color": [0.64, 0.64, 0.645, 1.0]},
        "lights": LESS_FLASH_LIGHTS,
        "postprocess": {
            "product": {"brightness": 0.935, "contrast": 1.06, "blend": 0.12},
            "side_soften": lower_stone_mask(brightness=0.74, contrast=1.16, blend=0.26),
            "center_stone": center_post(contrast=1.14, brightness=0.97, blend=0.22, detail=0.09),
            "diamond_facets": {"enabled": False},
        },
        "material_tuning": {
            "metal_base": [0.305, 0.32, 0.35, 1.0],
            "metal_roughness": 0.2,
            "specular": 0.62,
            "center_value": 0.54,
        },
    },
    {
        "name": "v159c_son2_metal_more_satin_center_clean",
        "render": {"samples": 560, "exposure": -0.17},
        "world": {"color": [0.66, 0.66, 0.665], "strength": 0.006},
        "background": {"color": [0.66, 0.66, 0.665, 1.0]},
        "lights": [
            *LESS_FLASH_LIGHTS[:1],
            {
                "name": "right_rim_strip",
                "type": "AREA",
                "position": [2.25, -0.12, 1.5],
                "rotation_degrees": [76, 0, 48],
                "size": 0.78,
                "size_y": 2.0,
                "power": 190,
            },
            *LESS_FLASH_LIGHTS[2:],
        ],
        "postprocess": {
            "product": {"brightness": 0.94, "contrast": 1.05, "blend": 0.1},
            "side_soften": lower_stone_mask(brightness=0.8, contrast=1.1, blend=0.18),
            "center_stone": center_post(contrast=1.1, brightness=0.972, blend=0.18, detail=0.07),
            "diamond_facets": {"enabled": False},
        },
        "material_tuning": {
            "metal_base": [0.34, 0.355, 0.385, 1.0],
            "metal_roughness": 0.28,
            "specular": 0.5,
            "center_value": 0.56,
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        tuning = variant.pop("material_tuning")
        recipe = deep_merge(base, variant)
        tune_materials(recipe, **tuning)
        recipe["description"] = (
            "son2 flash reduction pass. Bottom center stone white reflection reduced, top softbox/floor bounce "
            "lowered, and white-gold metal made darker/rougher so it reads as metal instead of white flash."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

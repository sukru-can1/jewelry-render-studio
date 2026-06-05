from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v159b_son2_lower_stone_tamed.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def reflection_only_card(name: str, position: list[float], rotation: list[float], size: list[float], color: list[float]) -> dict:
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
        "visible_to_transmission": True,
        "visible_to_volume_scatter": False,
    }


def tune_materials(recipe: dict, *, center_value: float, metal_base: list[float], roughness: float, specular: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        adjust = rule.setdefault("source_material_adjust", {})
        if "diamond_round_11" in tokens:
            adjust["hsv_value_scale"] = center_value
            adjust["hsv_value_max"] = 0.92
            adjust["glass_color_mix"] = 0.2
            adjust["diffuse_color"] = [0.5, 0.54, 0.61, 1.0]
        elif "prong" in tokens or "object_" in tokens:
            adjust["base_color"] = metal_base
            adjust["diffuse_color"] = metal_base
            adjust["roughness"] = roughness
            adjust["specular_ior_level"] = specular


def lower_stone_mask(*, brightness: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [[0.355, 0.635, 0.645, 0.842]],
        "blur_radius": 0.3,
        "brightness": brightness,
        "contrast": 1.12,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 24,
        "mask_shape": "ellipse",
    }


BASE_REFLECTION_CARDS = [
    reflection_only_card(
        "lower_diamond_reflection_only_dark_floor_cut",
        [0.0, -1.15, 0.24],
        [72, 0, 0],
        [2.3, 0.52],
        [0.006, 0.006, 0.008, 1.0],
    ),
    reflection_only_card(
        "front_pavilion_reflection_only_gray_break",
        [0.0, -1.55, 0.54],
        [76, 0, 0],
        [2.0, 0.56],
        [0.035, 0.037, 0.043, 1.0],
    ),
]


VARIANTS = [
    {
        "name": "v161a_son2_reflection_only_lower_stone_fix",
        "render": {"samples": 620, "exposure": -0.182},
        "world": {"color": [0.64, 0.64, 0.645], "strength": 0.0035},
        "background": {"color": [0.64, 0.64, 0.645, 1.0]},
        "reflection_cards": None,
        "postprocess": {
            "product": {"brightness": 0.935, "contrast": 1.055, "blend": 0.1},
            "side_soften": lower_stone_mask(brightness=0.78, blend=0.18),
        },
        "material": {
            "center_value": 0.53,
            "metal_base": [0.305, 0.32, 0.35, 1.0],
            "roughness": 0.2,
            "specular": 0.6,
        },
        "extra_cards": BASE_REFLECTION_CARDS,
    },
    {
        "name": "v161b_son2_stronger_refraction_floor_cut",
        "render": {"samples": 620, "exposure": -0.19},
        "world": {"color": [0.62, 0.62, 0.625], "strength": 0.003},
        "background": {"color": [0.62, 0.62, 0.625, 1.0]},
        "reflection_cards": None,
        "postprocess": {
            "product": {"brightness": 0.93, "contrast": 1.055, "blend": 0.1},
            "side_soften": lower_stone_mask(brightness=0.72, blend=0.22),
        },
        "material": {
            "center_value": 0.5,
            "metal_base": [0.29, 0.305, 0.335, 1.0],
            "roughness": 0.22,
            "specular": 0.56,
        },
        "extra_cards": [
            *BASE_REFLECTION_CARDS,
            reflection_only_card(
                "narrow_table_reflection_only_dark_line",
                [0.0, -0.72, 1.4],
                [48, 0, 0],
                [1.35, 0.18],
                [0.004, 0.004, 0.006, 1.0],
            ),
        ],
    },
    {
        "name": "v161c_son2_less_post_more_physical_reflection",
        "render": {"samples": 620, "exposure": -0.18},
        "world": {"color": [0.65, 0.65, 0.655], "strength": 0.0035},
        "background": {"color": [0.65, 0.65, 0.655, 1.0]},
        "reflection_cards": None,
        "postprocess": {
            "product": {"brightness": 0.94, "contrast": 1.05, "blend": 0.09},
            "side_soften": lower_stone_mask(brightness=0.84, blend=0.12),
        },
        "material": {
            "center_value": 0.55,
            "metal_base": [0.32, 0.335, 0.365, 1.0],
            "roughness": 0.2,
            "specular": 0.6,
        },
        "extra_cards": BASE_REFLECTION_CARDS,
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    base_cards = [card for card in base.get("reflection_cards", []) if "lower_pavilion" not in card.get("name", "")]
    for variant in VARIANTS:
        material = variant.pop("material")
        extra_cards = variant.pop("extra_cards")
        recipe = deep_merge(base, variant)
        recipe["reflection_cards"] = copy.deepcopy(base_cards) + copy.deepcopy(extra_cards)
        tune_materials(recipe, **material)
        recipe["description"] = (
            "son2 v161 physical lower-stone fix. Adds reflection/refraction-only dark cards so the lower "
            "diamond sees less white floor without adding camera-visible floor rectangles or shadows."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

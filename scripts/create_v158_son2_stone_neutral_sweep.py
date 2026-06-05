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


def tune_center(recipe: dict, *, value: float, saturation: float, glass_mix: float) -> None:
    for rule in recipe.get("material_map", []):
        if "diamond_round_11" not in [token.lower() for token in rule.get("contains", [])]:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["saturation_scale"] = saturation
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = [0.58, 0.61, 0.67, 1.0]


def center_post(*, contrast: float, brightness: float, blend: float, detail: float, cutoff: float = 0.25) -> dict:
    return {
        "enabled": True,
        "object_contains": ["diamond_round_11"],
        "padding_px": 0,
        "autocontrast_cutoff": cutoff,
        "contrast": contrast,
        "brightness": brightness,
        "saturation": 0.93,
        "sharpness": 1.12,
        "unsharp_radius": 0.55,
        "unsharp_percent": 82,
        "unsharp_threshold": 2,
        "detail_amount": detail,
        "detail_radius": 2.0,
        "detail_threshold": 1,
        "blend": blend,
        "mask_feather": 9,
    }


def add_cards(recipe: dict, cards: list[dict]) -> None:
    recipe.setdefault("reflection_cards", []).extend(cards)


NEUTRAL_TABLE_CARD = {
    "name": "center_table_neutral_dark_slit",
    "position": [0.0, -0.62, 1.58],
    "rotation_degrees": [50, 0, 0],
    "size": [1.25, 0.18],
    "color": [0.006, 0.006, 0.008, 1.0],
    "visible_to_camera": False,
}

LOWER_PAVILION_CARD = {
    "name": "center_lower_pavilion_gray_break",
    "position": [0.0, -1.08, 0.82],
    "rotation_degrees": [70, 0, 0],
    "size": [1.65, 0.42],
    "color": [0.045, 0.047, 0.052, 1.0],
    "visible_to_camera": False,
}

SIDE_NEUTRAL_CARDS = [
    {
        "name": "diamond_left_neutral_facet_card",
        "position": [-1.12, -0.82, 1.34],
        "rotation_degrees": [62, 0, -44],
        "size": [1.05, 1.65],
        "color": [0.018, 0.02, 0.025, 1.0],
        "visible_to_camera": False,
    },
    {
        "name": "diamond_right_neutral_facet_card",
        "position": [1.12, -0.82, 1.34],
        "rotation_degrees": [62, 0, 44],
        "size": [1.05, 1.65],
        "color": [0.018, 0.02, 0.025, 1.0],
        "visible_to_camera": False,
    },
]


VARIANTS = [
    {
        "name": "v158a_son2_stone_neutral_table_break",
        "render": {"samples": 520, "exposure": -0.16},
        "postprocess": {
            "center_stone": center_post(contrast=1.2, brightness=0.982, blend=0.27, detail=0.12),
            "diamond_facets": {"enabled": False},
        },
        "center": {"value": 0.6, "saturation": 0.9, "glass_mix": 0.1},
        "cards": [NEUTRAL_TABLE_CARD, LOWER_PAVILION_CARD],
    },
    {
        "name": "v158b_son2_stone_neutral_side_facets",
        "render": {"samples": 520, "exposure": -0.165},
        "lights": [
            {"name": "large_top_softbox", "type": "AREA", "position": [0.0, -1.2, 3.7], "rotation_degrees": [58, 0, 0], "size": 3.8, "size_y": 3.4, "power": 88},
            {"name": "right_rim_strip", "type": "AREA", "position": [2.15, -0.18, 1.55], "rotation_degrees": [76, 0, 48], "size": 0.9, "size_y": 2.1, "power": 315},
            {"name": "left_soft_strip", "type": "AREA", "position": [-2.35, -2.05, 1.1], "rotation_degrees": [72, 0, -36], "size": 1.15, "size_y": 2.0, "power": 8},
            {"name": "diamond_pin_1", "type": "POINT", "position": [-0.45, -0.9, 1.35], "power": 650, "shadow_soft_size": 0.006},
            {"name": "diamond_pin_2", "type": "POINT", "position": [0.58, -1.08, 1.55], "power": 540, "shadow_soft_size": 0.006},
        ],
        "postprocess": {
            "center_stone": center_post(contrast=1.23, brightness=0.98, blend=0.29, detail=0.13),
            "diamond_facets": {"enabled": False},
        },
        "center": {"value": 0.57, "saturation": 0.94, "glass_mix": 0.12},
        "cards": [NEUTRAL_TABLE_CARD, LOWER_PAVILION_CARD, *SIDE_NEUTRAL_CARDS],
    },
    {
        "name": "v158c_son2_stone_cleaner_less_dark",
        "render": {"samples": 520, "exposure": -0.145},
        "postprocess": {
            "center_stone": center_post(contrast=1.16, brightness=0.988, blend=0.23, detail=0.1, cutoff=0.15),
            "diamond_facets": {"enabled": False},
        },
        "center": {"value": 0.64, "saturation": 0.88, "glass_mix": 0.08},
        "cards": [LOWER_PAVILION_CARD],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        center = variant.pop("center")
        cards = variant.pop("cards")
        recipe = deep_merge(base, variant)
        tune_center(recipe, **center)
        add_cards(recipe, cards)
        recipe["description"] = (
            "son2 neutral stone pass. No overlay and no blue spill; uses neutral dark cards and center-stone "
            "postprocess to reduce milky lower wash and sharpen diamond facets."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

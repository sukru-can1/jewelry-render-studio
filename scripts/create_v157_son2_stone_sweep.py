from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v156a_son2_balanced_dark_metal_clear_diamond.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def tune_center_rule(recipe: dict, *, value: float, saturation: float, glass_mix: float, diffuse: list[float]) -> None:
    for rule in recipe.get("material_map", []):
        if "diamond_round_11" not in [token.lower() for token in rule.get("contains", [])]:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["hsv_value_scale"] = value
        adjust["saturation_scale"] = saturation
        adjust["glass_color_mix"] = glass_mix
        adjust["diffuse_color"] = diffuse


def center_postprocess(*, contrast: float, brightness: float, sharpness: float, blend: float, detail: float) -> dict:
    return {
        "enabled": True,
        "object_contains": ["diamond_round_11"],
        "padding_px": 0,
        "autocontrast_cutoff": 0.2,
        "contrast": contrast,
        "brightness": brightness,
        "saturation": 0.94,
        "sharpness": sharpness,
        "unsharp_radius": 0.65,
        "unsharp_percent": 72,
        "unsharp_threshold": 2,
        "detail_amount": detail,
        "detail_radius": 2.4,
        "detail_threshold": 1,
        "blend": blend,
        "mask_feather": 10,
    }


def add_facet_cards(recipe: dict, *, blue: bool = False, table: bool = False) -> None:
    cards = recipe.setdefault("reflection_cards", [])
    if blue:
        cards.extend(
            [
                {
                    "name": "diamond_left_blue_black_facet_card",
                    "position": [-1.18, -0.86, 1.42],
                    "rotation_degrees": [61, 0, -45],
                    "size": [1.25, 1.85],
                    "color": [0.004, 0.018, 0.06, 1.0],
                    "visible_to_camera": False,
                },
                {
                    "name": "diamond_right_blue_black_facet_card",
                    "position": [1.18, -0.86, 1.42],
                    "rotation_degrees": [61, 0, 45],
                    "size": [1.25, 1.85],
                    "color": [0.004, 0.018, 0.06, 1.0],
                    "visible_to_camera": False,
                },
            ]
        )
    if table:
        cards.append(
            {
                "name": "narrow_dark_table_break_card",
                "position": [0.0, -0.66, 1.63],
                "rotation_degrees": [48, 0, 0],
                "size": [1.15, 0.22],
                "color": [0.004, 0.004, 0.006, 1.0],
                "visible_to_camera": False,
            }
        )


VARIANTS = [
    {
        "name": "v157a_son2_stone_natural_crisper_no_overlay",
        "render": {"samples": 480, "exposure": -0.155},
        "postprocess": {
            "center_stone": center_postprocess(contrast=1.18, brightness=0.985, sharpness=1.11, blend=0.24, detail=0.11),
            "diamond_facets": {"enabled": False},
        },
        "center_tuning": {
            "value": 0.63,
            "saturation": 0.88,
            "glass_mix": 0.10,
            "diffuse": [0.61, 0.64, 0.69, 1.0],
        },
    },
    {
        "name": "v157b_son2_stone_blue_black_internal_fire",
        "render": {"samples": 480, "exposure": -0.165},
        "lights": [
            {"name": "large_top_softbox", "type": "AREA", "position": [0.0, -1.2, 3.7], "rotation_degrees": [58, 0, 0], "size": 3.8, "size_y": 3.4, "power": 82},
            {"name": "right_rim_strip", "type": "AREA", "position": [2.15, -0.18, 1.55], "rotation_degrees": [76, 0, 48], "size": 0.9, "size_y": 2.1, "power": 330},
            {"name": "left_soft_strip", "type": "AREA", "position": [-2.35, -2.05, 1.1], "rotation_degrees": [72, 0, -36], "size": 1.15, "size_y": 2.0, "power": 7},
            {"name": "diamond_pin_1", "type": "POINT", "position": [-0.45, -0.9, 1.35], "power": 700, "shadow_soft_size": 0.006},
            {"name": "diamond_pin_2", "type": "POINT", "position": [0.58, -1.08, 1.55], "power": 580, "shadow_soft_size": 0.006},
        ],
        "postprocess": {
            "center_stone": center_postprocess(contrast=1.22, brightness=0.982, sharpness=1.12, blend=0.27, detail=0.13),
            "diamond_facets": {"enabled": False},
        },
        "center_tuning": {
            "value": 0.58,
            "saturation": 0.96,
            "glass_mix": 0.12,
            "diffuse": [0.56, 0.6, 0.67, 1.0],
        },
        "facet_cards": {"blue": True, "table": True},
    },
    {
        "name": "v157c_son2_stone_subtle_faceted_post",
        "render": {"samples": 480, "exposure": -0.16},
        "postprocess": {
            "center_stone": center_postprocess(contrast=1.16, brightness=0.986, sharpness=1.1, blend=0.22, detail=0.1),
            "diamond_facets": {
                "enabled": True,
                "object_contains": ["diamond_round_11"],
                "padding_px": 0,
                "facets": 32,
                "center_x": 0.5,
                "center_y": 0.5,
                "radius_x": 0.45,
                "radius_y": 0.405,
                "inner_ratio": 0.22,
                "table_radius": 0.18,
                "dark_alpha": 0.12,
                "light_alpha": 0.08,
                "chroma_alpha": 0.02,
                "line_alpha": 0.045,
                "mask_feather": 8,
            },
        },
        "center_tuning": {
            "value": 0.64,
            "saturation": 0.9,
            "glass_mix": 0.1,
            "diffuse": [0.61, 0.64, 0.69, 1.0],
        },
        "facet_cards": {"blue": False, "table": True},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        center_tuning = variant.pop("center_tuning")
        facet_cards = variant.pop("facet_cards", None)
        recipe = deep_merge(base, variant)
        tune_center_rule(recipe, **center_tuning)
        if facet_cards:
            add_facet_cards(recipe, **facet_cards)
        recipe["description"] = (
            "son2 stone pass from v156a. Product/model unchanged; improves center diamond contrast, "
            "facet sharpness, and internal dark/bright reflections."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE = ROOT / "v144b_render_dark_reflectors_clean_table.json"


def diamond_rules(recipe: dict, adjust: dict) -> None:
    for item in recipe.get("material_map", []):
        contains = " ".join(item.get("contains", [])).lower()
        if any(token in contains for token in ("round_5", "diamond", "stone_emerald")):
            merged = dict(item.get("source_material_adjust", {}))
            merged.update(adjust)
            item["source_material_adjust"] = merged


def light(recipe: dict, name: str) -> dict:
    for item in recipe["lights"]:
        if item["name"] == name:
            return item
    raise KeyError(name)


def card(recipe: dict, name: str) -> dict:
    for item in recipe["reflection_cards"]:
        if item["name"] == name:
            return item
    raise KeyError(name)


def add_card(recipe: dict, name: str, position: list[float], rotation: list[float], size: list[float], color: list[float]) -> None:
    recipe["reflection_cards"].append(
        {
            "name": name,
            "position": position,
            "rotation_degrees": rotation,
            "size": size,
            "color": color,
            "visible_to_camera": False,
        }
    )


def facet_postprocess(recipe: dict, *, dark: float, lightness: float, chroma: float, lines: float, blend: float) -> None:
    recipe["postprocess"]["center_stone"].update(
        {
            "contrast": 1.16 + dark * 0.20,
            "brightness": 0.985,
            "saturation": 0.96,
            "sharpness": 1.08,
            "unsharp_percent": 90,
            "detail_amount": 0.14,
            "blend": blend,
            "mask_feather": 10,
        }
    )
    recipe["postprocess"]["diamond_facets"] = {
        "enabled": True,
        "object_contains": ["Round_5"],
        "fallback_bounds_norm": [0.365, 0.555, 0.635, 0.825],
        "padding_px": 0,
        "facets": 32,
        "center_x": 0.5,
        "center_y": 0.5,
        "radius_x": 0.445,
        "radius_y": 0.405,
        "inner_ratio": 0.22,
        "table_radius": 0.20,
        "dark_alpha": dark,
        "light_alpha": lightness,
        "chroma_alpha": chroma,
        "line_alpha": lines,
        "mask_feather": 8,
    }


def base_recipe(source: dict, name: str) -> dict:
    recipe = copy.deepcopy(source)
    recipe["name"] = name
    recipe["description"] = (
        "Original product geometry unchanged. Diamond pass aimed at 77 Diamonds 1477 reference: "
        "crisp dark star facets, clean white crown flashes, blue-black reflector wedges, lower haze."
    )
    recipe["render"]["samples"] = 420
    recipe["render"]["denoise"] = True
    recipe["render"]["exposure"] = -0.06
    recipe["render"]["look"] = "High Contrast"
    recipe["world"]["strength"] = 0.032
    recipe["background"]["color"] = [0.835, 0.835, 0.84, 1]
    recipe["postprocess"].pop("diamond_facets", None)
    return recipe


def main() -> None:
    source = json.loads(BASE.read_text(encoding="utf-8-sig"))
    variants: list[dict] = []

    recipe = base_recipe(source, "v146a_goal77_crisp_dark_star")
    diamond_rules(
        recipe,
        {
            "volume_density_scale": 0.0,
            "volume_density_max": 0.0,
            "hsv_value_scale": 0.42,
            "hsv_value_max": 1.28,
            "saturation_scale": 1.22,
            "diffuse_color": [0.62, 0.64, 0.68, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 260
    light(recipe, "right_rim_strip")["power"] = 230
    light(recipe, "left_front_strip")["power"] = 12
    light(recipe, "diamond_sparkle_pin_1")["power"] = 360
    light(recipe, "diamond_sparkle_pin_2")["power"] = 330
    card(recipe, "dark_upper_facet_reflection")["position"] = [-0.05, -0.72, 2.02]
    card(recipe, "dark_upper_facet_reflection")["size"] = [5.3, 1.55]
    add_card(recipe, "deep_blue_left_facet_card", [-1.45, -1.0, 1.55], [62, 0, -44], [1.25, 1.9], [0.015, 0.045, 0.12, 1])
    facet_postprocess(recipe, dark=0.34, lightness=0.18, chroma=0.055, lines=0.12, blend=0.30)
    variants.append(recipe)

    recipe = base_recipe(source, "v146b_goal77_clean_white_table")
    diamond_rules(
        recipe,
        {
            "volume_density_scale": 0.0,
            "volume_density_max": 0.0,
            "hsv_value_scale": 0.50,
            "hsv_value_max": 1.34,
            "saturation_scale": 1.10,
            "diffuse_color": [0.70, 0.71, 0.73, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 330
    light(recipe, "right_rim_strip")["power"] = 200
    light(recipe, "left_front_strip")["power"] = 18
    light(recipe, "diamond_sparkle_pin_1")["power"] = 315
    light(recipe, "diamond_sparkle_pin_2")["power"] = 300
    facet_postprocess(recipe, dark=0.24, lightness=0.22, chroma=0.04, lines=0.09, blend=0.24)
    variants.append(recipe)

    recipe = base_recipe(source, "v146c_goal77_blue_black_wedges")
    diamond_rules(
        recipe,
        {
            "volume_density_scale": 0.01,
            "volume_density_max": 0.01,
            "hsv_value_scale": 0.40,
            "hsv_value_max": 1.24,
            "saturation_scale": 1.30,
            "diffuse_color": [0.58, 0.61, 0.66, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 240
    light(recipe, "right_rim_strip")["power"] = 260
    light(recipe, "left_front_strip")["power"] = 10
    light(recipe, "lower_front_fill")["power"] = 3
    light(recipe, "diamond_sparkle_pin_1")["power"] = 380
    light(recipe, "diamond_sparkle_pin_2")["power"] = 350
    add_card(recipe, "deep_blue_right_facet_card", [1.35, -0.95, 1.55], [62, 0, 42], [1.45, 2.1], [0.01, 0.035, 0.11, 1])
    add_card(recipe, "narrow_black_table_card", [0.0, -0.62, 1.75], [48, 0, 0], [1.1, 0.28], [0.003, 0.003, 0.005, 1])
    facet_postprocess(recipe, dark=0.38, lightness=0.16, chroma=0.08, lines=0.13, blend=0.32)
    variants.append(recipe)

    recipe = base_recipe(source, "v146d_goal77_sharp_photo_grade")
    recipe["render"]["exposure"] = -0.04
    recipe["world"]["strength"] = 0.04
    diamond_rules(
        recipe,
        {
            "volume_density_scale": 0.0,
            "volume_density_max": 0.0,
            "hsv_value_scale": 0.46,
            "hsv_value_max": 1.30,
            "saturation_scale": 1.16,
            "diffuse_color": [0.66, 0.67, 0.70, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 295
    light(recipe, "right_rim_strip")["power"] = 225
    light(recipe, "diamond_sparkle_pin_1")["power"] = 345
    light(recipe, "diamond_sparkle_pin_2")["power"] = 315
    recipe["postprocess"]["product"].update({"contrast": 1.035, "brightness": 0.995, "sharpness": 1.035, "blend": 0.12})
    facet_postprocess(recipe, dark=0.30, lightness=0.20, chroma=0.045, lines=0.11, blend=0.28)
    variants.append(recipe)

    recipe = base_recipe(source, "v146e_goal77_strong_reference_facets")
    diamond_rules(
        recipe,
        {
            "volume_density_scale": 0.0,
            "volume_density_max": 0.0,
            "hsv_value_scale": 0.36,
            "hsv_value_max": 1.36,
            "saturation_scale": 1.32,
            "diffuse_color": [0.55, 0.58, 0.64, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 235
    light(recipe, "right_rim_strip")["power"] = 280
    light(recipe, "left_front_strip")["power"] = 8
    light(recipe, "lower_front_fill")["power"] = 2
    light(recipe, "diamond_sparkle_pin_1")["power"] = 410
    light(recipe, "diamond_sparkle_pin_2")["power"] = 370
    card(recipe, "front_low_black_reflection")["size"] = [4.8, 0.72]
    add_card(recipe, "deep_blue_left_reference_card", [-1.25, -0.92, 1.35], [65, 0, -48], [1.8, 2.15], [0.0, 0.025, 0.085, 1])
    add_card(recipe, "deep_blue_right_reference_card", [1.25, -0.92, 1.35], [65, 0, 48], [1.8, 2.15], [0.0, 0.025, 0.085, 1])
    facet_postprocess(recipe, dark=0.43, lightness=0.19, chroma=0.09, lines=0.15, blend=0.36)
    variants.append(recipe)

    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in variants:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

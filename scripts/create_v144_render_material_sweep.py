from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE = ROOT / "v143c_original_product_render_black_facet_cards.json"


def diamonds(recipe: dict, adjust: dict) -> None:
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


def base_recipe(source: dict, name: str) -> dict:
    recipe = copy.deepcopy(source)
    recipe["name"] = name
    recipe["description"] = "Original product intact; render-material sweep for clearer diamond and goal-like studio contrast."
    recipe["render"]["samples"] = 360
    recipe["render"]["denoise"] = True
    recipe["render"]["exposure"] = -0.045
    recipe["world"]["strength"] = 0.04
    recipe["postprocess"]["center_stone"].update(
        {
            "contrast": 1.08,
            "brightness": 0.992,
            "sharpness": 1.035,
            "unsharp_percent": 58,
            "detail_amount": 0.06,
            "blend": 0.10,
        }
    )
    recipe["postprocess"]["product"].update(
        {
            "contrast": 1.025,
            "brightness": 0.998,
            "sharpness": 1.025,
            "blend": 0.10,
        }
    )
    recipe["postprocess"].pop("diamond_facets", None)
    return recipe


def main() -> None:
    source = json.loads(BASE.read_text(encoding="utf-8-sig"))
    variants = []

    recipe = base_recipe(source, "v144a_render_clearer_stone_low_haze")
    diamonds(
        recipe,
        {
            "glass_color_mix": 0.0,
            "volume_color_mix": 0.0,
            "volume_density_scale": 0.0,
            "volume_density_max": 0.0,
            "hsv_value_scale": 0.54,
            "hsv_value_max": 1.18,
            "saturation_scale": 1.18,
            "diffuse_color": [0.72, 0.72, 0.72, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 320
    light(recipe, "lower_front_fill")["power"] = 8
    light(recipe, "diamond_sparkle_pin_1")["power"] = 265
    light(recipe, "diamond_sparkle_pin_2")["power"] = 235
    variants.append(recipe)

    recipe = base_recipe(source, "v144b_render_dark_reflectors_clean_table")
    diamonds(
        recipe,
        {
            "glass_color_mix": 0.0,
            "volume_color_mix": 0.0,
            "volume_density_scale": 0.02,
            "volume_density_max": 0.02,
            "hsv_value_scale": 0.48,
            "hsv_value_max": 1.22,
            "saturation_scale": 1.16,
            "diffuse_color": [0.68, 0.68, 0.68, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 300
    light(recipe, "left_front_strip")["power"] = 22
    light(recipe, "right_rim_strip")["power"] = 190
    light(recipe, "lower_front_fill")["power"] = 6
    light(recipe, "diamond_sparkle_pin_1")["power"] = 300
    light(recipe, "diamond_sparkle_pin_2")["power"] = 260
    card(recipe, "dark_upper_facet_reflection")["position"] = [-0.25, -0.72, 2.05]
    card(recipe, "dark_upper_facet_reflection")["size"] = [4.8, 1.35]
    variants.append(recipe)

    recipe = base_recipe(source, "v144c_render_balanced_photo_stone")
    recipe["render"]["exposure"] = -0.03
    recipe["world"]["strength"] = 0.055
    diamonds(
        recipe,
        {
            "glass_color_mix": 0.001,
            "volume_color_mix": 0.001,
            "volume_density_scale": 0.03,
            "volume_density_max": 0.025,
            "hsv_value_scale": 0.60,
            "hsv_value_max": 1.14,
            "saturation_scale": 1.10,
            "diffuse_color": [0.76, 0.76, 0.76, 1],
        },
    )
    light(recipe, "large_top_softbox")["power"] = 350
    light(recipe, "left_front_strip")["power"] = 30
    light(recipe, "right_rim_strip")["power"] = 160
    light(recipe, "lower_front_fill")["power"] = 14
    light(recipe, "diamond_sparkle_pin_1")["power"] = 245
    light(recipe, "diamond_sparkle_pin_2")["power"] = 220
    variants.append(recipe)

    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in variants:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

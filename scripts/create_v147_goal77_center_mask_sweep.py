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


def facet_postprocess(recipe: dict, *, dark: float, lightness: float, chroma: float, lines: float) -> None:
    recipe["postprocess"]["center_stone"].update(
        {
            "object_contains": ["__fallback_center_stone_only__"],
            "fallback_bounds_norm": [0.365, 0.555, 0.635, 0.825],
            "contrast": 1.18,
            "brightness": 0.99,
            "saturation": 0.96,
            "sharpness": 1.09,
            "unsharp_percent": 88,
            "detail_amount": 0.11,
            "blend": 0.22,
            "mask_feather": 12,
        }
    )
    recipe["postprocess"]["diamond_facets"] = {
        "enabled": True,
        "object_contains": ["__fallback_center_stone_only__"],
        "fallback_bounds_norm": [0.365, 0.555, 0.635, 0.825],
        "padding_px": 0,
        "facets": 32,
        "center_x": 0.5,
        "center_y": 0.5,
        "radius_x": 0.43,
        "radius_y": 0.40,
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
        "Corrected center-stone-only diamond pass for the 77 Diamonds 1477 reference. "
        "Original product/model unchanged; fallback mask prevents whole-scene facet overlay."
    )
    recipe["render"]["samples"] = 320
    recipe["render"]["denoise"] = True
    recipe["render"]["exposure"] = -0.055
    recipe["render"]["look"] = "High Contrast"
    recipe["world"]["strength"] = 0.035
    recipe["background"]["color"] = [0.84, 0.84, 0.845, 1]
    recipe["postprocess"].pop("diamond_facets", None)
    return recipe


def main() -> None:
    source = json.loads(BASE.read_text(encoding="utf-8-sig"))
    variants: list[dict] = []

    recipe = base_recipe(source, "v147a_goal77_center_crisp_subtle")
    diamond_rules(recipe, {"volume_density_scale": 0.0, "volume_density_max": 0.0, "hsv_value_scale": 0.46, "hsv_value_max": 1.28, "saturation_scale": 1.12, "diffuse_color": [0.66, 0.67, 0.70, 1]})
    light(recipe, "large_top_softbox")["power"] = 290
    light(recipe, "right_rim_strip")["power"] = 215
    light(recipe, "left_front_strip")["power"] = 14
    light(recipe, "diamond_sparkle_pin_1")["power"] = 320
    light(recipe, "diamond_sparkle_pin_2")["power"] = 295
    facet_postprocess(recipe, dark=0.16, lightness=0.14, chroma=0.035, lines=0.06)
    variants.append(recipe)

    recipe = base_recipe(source, "v147b_goal77_center_dark_star")
    diamond_rules(recipe, {"volume_density_scale": 0.0, "volume_density_max": 0.0, "hsv_value_scale": 0.40, "hsv_value_max": 1.31, "saturation_scale": 1.18, "diffuse_color": [0.60, 0.62, 0.67, 1]})
    light(recipe, "large_top_softbox")["power"] = 255
    light(recipe, "right_rim_strip")["power"] = 245
    light(recipe, "left_front_strip")["power"] = 10
    light(recipe, "lower_front_fill")["power"] = 3
    light(recipe, "diamond_sparkle_pin_1")["power"] = 360
    light(recipe, "diamond_sparkle_pin_2")["power"] = 330
    add_card(recipe, "center_deep_blue_left_reflector", [-1.2, -0.9, 1.35], [64, 0, -48], [1.5, 2.0], [0.005, 0.03, 0.10, 1])
    facet_postprocess(recipe, dark=0.24, lightness=0.14, chroma=0.055, lines=0.08)
    variants.append(recipe)

    recipe = base_recipe(source, "v147c_goal77_center_clean_table")
    recipe["render"]["exposure"] = -0.035
    diamond_rules(recipe, {"volume_density_scale": 0.0, "volume_density_max": 0.0, "hsv_value_scale": 0.52, "hsv_value_max": 1.34, "saturation_scale": 1.06, "diffuse_color": [0.72, 0.72, 0.74, 1]})
    light(recipe, "large_top_softbox")["power"] = 335
    light(recipe, "right_rim_strip")["power"] = 190
    light(recipe, "left_front_strip")["power"] = 18
    light(recipe, "diamond_sparkle_pin_1")["power"] = 300
    light(recipe, "diamond_sparkle_pin_2")["power"] = 280
    facet_postprocess(recipe, dark=0.13, lightness=0.18, chroma=0.025, lines=0.05)
    variants.append(recipe)

    recipe = base_recipe(source, "v147d_goal77_center_blue_wedges")
    diamond_rules(recipe, {"volume_density_scale": 0.0, "volume_density_max": 0.0, "hsv_value_scale": 0.38, "hsv_value_max": 1.26, "saturation_scale": 1.24, "diffuse_color": [0.58, 0.61, 0.66, 1]})
    light(recipe, "large_top_softbox")["power"] = 250
    light(recipe, "right_rim_strip")["power"] = 255
    light(recipe, "left_front_strip")["power"] = 8
    light(recipe, "lower_front_fill")["power"] = 2
    light(recipe, "diamond_sparkle_pin_1")["power"] = 370
    light(recipe, "diamond_sparkle_pin_2")["power"] = 340
    add_card(recipe, "center_deep_blue_left_reflector", [-1.25, -0.95, 1.35], [66, 0, -50], [1.7, 2.1], [0.0, 0.025, 0.09, 1])
    add_card(recipe, "center_deep_blue_right_reflector", [1.25, -0.95, 1.35], [66, 0, 50], [1.7, 2.1], [0.0, 0.025, 0.09, 1])
    facet_postprocess(recipe, dark=0.22, lightness=0.13, chroma=0.075, lines=0.08)
    variants.append(recipe)

    recipe = base_recipe(source, "v147e_goal77_center_no_overlay_physical")
    diamond_rules(recipe, {"volume_density_scale": 0.0, "volume_density_max": 0.0, "hsv_value_scale": 0.39, "hsv_value_max": 1.30, "saturation_scale": 1.24, "diffuse_color": [0.60, 0.63, 0.68, 1]})
    light(recipe, "large_top_softbox")["power"] = 245
    light(recipe, "right_rim_strip")["power"] = 270
    light(recipe, "left_front_strip")["power"] = 7
    light(recipe, "lower_front_fill")["power"] = 2
    light(recipe, "diamond_sparkle_pin_1")["power"] = 390
    light(recipe, "diamond_sparkle_pin_2")["power"] = 350
    add_card(recipe, "center_deep_blue_right_reflector", [1.15, -0.92, 1.35], [66, 0, 48], [1.8, 2.15], [0.0, 0.025, 0.085, 1])
    recipe["postprocess"]["center_stone"].update({"object_contains": ["__fallback_center_stone_only__"], "fallback_bounds_norm": [0.365, 0.555, 0.635, 0.825], "contrast": 1.20, "sharpness": 1.10, "blend": 0.24})
    variants.append(recipe)

    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in variants:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

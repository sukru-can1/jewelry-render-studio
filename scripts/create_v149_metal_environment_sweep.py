from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE = ROOT / "v147e_goal77_center_no_overlay_physical.json"


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


def set_metal(recipe: dict, color: list[float], mix: float, roughness: float) -> None:
    for item in recipe.get("material_map", []):
        contains = " ".join(item.get("contains", [])).lower()
        if any(token in contains for token in ("metal", "band", "shank", "prong", "basket")):
            adjust = dict(item.get("source_material_adjust", {}))
            adjust.update(
                {
                    "base_color": color,
                    "base_color_mix": mix,
                    "metallic": 1,
                    "roughness": roughness,
                    "specular_ior_level": 0.92,
                    "diffuse_color": color,
                }
            )
            item["source_material_adjust"] = adjust


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


def base_recipe(source: dict, name: str) -> dict:
    recipe = copy.deepcopy(source)
    recipe["name"] = name
    recipe["description"] = (
        "Original product/model unchanged. Metal/environment pass: darker platinum, less white wash, "
        "more controlled gray/black reflection and contact shadow so the diamond gets better contrast."
    )
    recipe["render"]["samples"] = 320
    recipe["render"]["denoise"] = True
    recipe["render"]["exposure"] = -0.065
    recipe["render"]["look"] = "High Contrast"
    recipe["world"]["strength"] = 0.026
    recipe["background"]["color"] = [0.81, 0.81, 0.815, 1]
    recipe["reflection_cards"] = [
        item for item in recipe["reflection_cards"] if not item["name"].startswith("center_deep_blue")
    ]
    recipe["postprocess"].pop("diamond_facets", None)
    recipe["postprocess"]["center_stone"].update(
        {
            "object_contains": ["__fallback_center_stone_only__"],
            "fallback_bounds_norm": [0.365, 0.555, 0.635, 0.825],
            "contrast": 1.18,
            "brightness": 0.99,
            "sharpness": 1.08,
            "blend": 0.20,
        }
    )
    recipe["postprocess"]["product"].update(
        {
            "contrast": 1.04,
            "brightness": 0.982,
            "saturation": 0.97,
            "sharpness": 1.025,
            "blend": 0.12,
        }
    )
    return recipe


def main() -> None:
    source = json.loads(BASE.read_text(encoding="utf-8-sig"))
    variants: list[dict] = []

    recipe = base_recipe(source, "v149a_gray_platinum_soft_shadow")
    set_metal(recipe, [0.49, 0.505, 0.535, 1], 0.74, 0.046)
    light(recipe, "large_top_softbox")["power"] = 215
    light(recipe, "large_top_softbox")["size"] = 5.2
    light(recipe, "right_rim_strip")["power"] = 190
    light(recipe, "left_front_strip")["power"] = 18
    light(recipe, "lower_front_fill")["power"] = 0
    light(recipe, "lower_shadow_lift_pin")["power"] = 2
    card(recipe, "soft_gray_side_reflection")["color"] = [0.30, 0.31, 0.33, 1]
    card(recipe, "visible_white_backdrop")["color"] = [0.72, 0.72, 0.725, 1]
    variants.append(recipe)

    recipe = base_recipe(source, "v149b_dark_edges_contact_shadow")
    set_metal(recipe, [0.44, 0.455, 0.49, 1], 0.82, 0.038)
    recipe["render"]["exposure"] = -0.085
    recipe["background"]["color"] = [0.79, 0.79, 0.795, 1]
    light(recipe, "large_top_softbox")["power"] = 185
    light(recipe, "large_top_softbox")["size"] = 4.8
    light(recipe, "right_rim_strip")["power"] = 220
    light(recipe, "left_front_strip")["power"] = 8
    light(recipe, "lower_front_fill")["power"] = 0
    light(recipe, "lower_shadow_lift_pin")["power"] = 0
    card(recipe, "front_low_black_reflection")["size"] = [5.2, 0.82]
    card(recipe, "dark_lower_reflection")["size"] = [4.8, 0.9]
    add_card(recipe, "rear_band_black_upper_line", [0, -0.58, 1.72], [46, 0, 0], [4.2, 0.34], [0.002, 0.002, 0.003, 1])
    variants.append(recipe)

    recipe = base_recipe(source, "v149c_balanced_gray_metal_diamond")
    set_metal(recipe, [0.52, 0.535, 0.56, 1], 0.68, 0.052)
    recipe["render"]["exposure"] = -0.055
    recipe["world"]["strength"] = 0.032
    light(recipe, "large_top_softbox")["power"] = 245
    light(recipe, "right_rim_strip")["power"] = 175
    light(recipe, "left_front_strip")["power"] = 22
    light(recipe, "lower_front_fill")["power"] = 4
    light(recipe, "lower_shadow_lift_pin")["power"] = 3
    card(recipe, "visible_white_backdrop")["color"] = [0.76, 0.76, 0.765, 1]
    add_card(recipe, "left_neutral_facet_card", [-1.25, -1.02, 1.22], [68, 0, -52], [1.45, 1.9], [0.06, 0.065, 0.075, 1])
    variants.append(recipe)

    recipe = base_recipe(source, "v149d_low_key_platinum_black_cards")
    set_metal(recipe, [0.46, 0.475, 0.51, 1], 0.86, 0.058)
    recipe["render"]["exposure"] = -0.075
    recipe["world"]["strength"] = 0.020
    light(recipe, "large_top_softbox")["power"] = 170
    light(recipe, "large_top_softbox")["size"] = 4.4
    light(recipe, "right_rim_strip")["power"] = 260
    light(recipe, "left_front_strip")["power"] = 6
    light(recipe, "diamond_sparkle_pin_1")["power"] = 430
    light(recipe, "diamond_sparkle_pin_2")["power"] = 380
    light(recipe, "lower_front_fill")["power"] = 0
    card(recipe, "left_black_reflection_wall")["color"] = [0.004, 0.004, 0.005, 1]
    card(recipe, "right_black_reflection_wall")["color"] = [0.004, 0.004, 0.005, 1]
    add_card(recipe, "right_neutral_dark_facet_card", [1.35, -0.95, 1.3], [66, 0, 48], [1.55, 2.0], [0.025, 0.028, 0.034, 1])
    variants.append(recipe)

    recipe = base_recipe(source, "v149e_reference_gray_band_clean")
    set_metal(recipe, [0.54, 0.55, 0.57, 1], 0.76, 0.070)
    recipe["render"]["exposure"] = -0.045
    recipe["background"]["color"] = [0.83, 0.83, 0.835, 1]
    light(recipe, "large_top_softbox")["power"] = 260
    light(recipe, "large_top_softbox")["size"] = 5.7
    light(recipe, "right_rim_strip")["power"] = 150
    light(recipe, "left_front_strip")["power"] = 26
    light(recipe, "lower_front_fill")["power"] = 3
    card(recipe, "soft_gray_side_reflection")["color"] = [0.38, 0.385, 0.395, 1]
    card(recipe, "visible_white_backdrop")["color"] = [0.78, 0.78, 0.785, 1]
    variants.append(recipe)

    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in variants:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

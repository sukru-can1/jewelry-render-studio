from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE = ROOT / "v128_final_original_product_goal_environment.json"


def set_all_diamond_adjust(recipe: dict, adjust: dict) -> None:
    for item in recipe.get("material_map", []):
        contains = " ".join(item.get("contains", [])).lower()
        if any(token in contains for token in ("round_5", "diamond", "stone_emerald")):
            merged = dict(item.get("source_material_adjust", {}))
            merged.update(adjust)
            item["source_material_adjust"] = merged


def set_metal(recipe: dict, roughness: float, base_mix: float) -> None:
    for item in recipe.get("material_map", []):
        contains = " ".join(item.get("contains", [])).lower()
        if any(token in contains for token in ("metal", "band", "shank", "prong", "basket")):
            merged = dict(item.get("source_material_adjust", {}))
            merged.update(
                {
                    "base_color": [0.62, 0.63, 0.65, 1],
                    "base_color_mix": base_mix,
                    "metallic": 1,
                    "roughness": roughness,
                    "specular_ior_level": 1.0,
                    "diffuse_color": [0.62, 0.63, 0.65, 1],
                }
            )
            item["source_material_adjust"] = merged


def light(recipe: dict, name: str) -> dict:
    for item in recipe.get("lights", []):
        if item.get("name") == name:
            return item
    raise KeyError(name)


def card(recipe: dict, name: str) -> dict:
    for item in recipe.get("reflection_cards", []):
        if item.get("name") == name:
            return item
    raise KeyError(name)


def common(base: dict, name: str) -> dict:
    recipe = copy.deepcopy(base)
    recipe["name"] = name
    recipe["description"] = "Original product intact; render-only sweep for goal studio lighting, stronger diamond reflections, and deeper chrome contrast."
    recipe["render"]["samples"] = 288
    recipe["render"]["exposure"] = -0.035
    recipe["render"]["look"] = "High Contrast"
    recipe["world"]["strength"] = 0.055
    recipe["background"]["color"] = [0.82, 0.82, 0.825, 1]
    recipe["model"]["ground_clearance"] = 0.18

    recipe["postprocess"]["center_stone"].update(
        {
            "contrast": 1.18,
            "brightness": 0.975,
            "sharpness": 1.09,
            "unsharp_percent": 105,
            "detail_amount": 0.18,
            "blend": 0.22,
        }
    )
    recipe["postprocess"]["product"].update(
        {
            "contrast": 1.045,
            "brightness": 0.992,
            "sharpness": 1.045,
            "blend": 0.16,
        }
    )
    recipe["postprocess"].pop("diamond_facets", None)
    recipe["facet_overlay"] = {"enabled": False}
    return recipe


def make_variants() -> list[dict]:
    base = json.loads(BASE.read_text(encoding="utf-8-sig"))
    variants = []

    recipe = common(base, "v143a_original_product_render_contrast_diamond")
    set_all_diamond_adjust(
        recipe,
        {
            "glass_color": [1, 1, 1, 1],
            "glass_color_mix": 0.005,
            "glass_roughness": 0,
            "ior": 2.417,
            "volume_color": [1, 1, 1, 1],
            "volume_color_mix": 0.004,
            "volume_density_scale": 0.06,
            "volume_density_max": 0.05,
            "saturation_scale": 1.08,
            "hsv_value_scale": 0.68,
            "hsv_value_max": 1.12,
            "diffuse_color": [0.82, 0.82, 0.82, 1],
        },
    )
    set_metal(recipe, 0.035, 0.50)
    light(recipe, "large_top_softbox")["power"] = 390
    light(recipe, "left_front_strip")["power"] = 42
    light(recipe, "right_rim_strip")["power"] = 155
    light(recipe, "diamond_sparkle_pin_1")["power"] = 190
    light(recipe, "diamond_sparkle_pin_2")["power"] = 165
    light(recipe, "lower_front_fill")["power"] = 22
    card(recipe, "dark_upper_facet_reflection")["color"] = [0.006, 0.006, 0.007, 1]
    card(recipe, "dark_upper_facet_reflection")["size"] = [3.4, 1.0]
    card(recipe, "front_low_black_reflection")["color"] = [0.018, 0.018, 0.02, 1]
    variants.append(recipe)

    recipe = common(base, "v143b_original_product_render_soft_goal_shadow")
    set_all_diamond_adjust(
        recipe,
        {
            "glass_color": [1, 1, 1, 1],
            "glass_color_mix": 0.006,
            "glass_roughness": 0,
            "ior": 2.417,
            "volume_color": [1, 1, 1, 1],
            "volume_color_mix": 0.006,
            "volume_density_scale": 0.10,
            "volume_density_max": 0.07,
            "saturation_scale": 1.04,
            "hsv_value_scale": 0.74,
            "hsv_value_max": 1.08,
            "diffuse_color": [0.86, 0.86, 0.86, 1],
        },
    )
    set_metal(recipe, 0.045, 0.46)
    recipe["render"]["exposure"] = -0.02
    recipe["world"]["strength"] = 0.075
    light(recipe, "large_top_softbox")["power"] = 440
    light(recipe, "left_front_strip")["power"] = 55
    light(recipe, "right_rim_strip")["power"] = 135
    light(recipe, "diamond_sparkle_pin_1")["power"] = 170
    light(recipe, "diamond_sparkle_pin_2")["power"] = 145
    light(recipe, "lower_front_fill")["power"] = 34
    card(recipe, "dark_lower_reflection")["color"] = [0.045, 0.045, 0.05, 1]
    card(recipe, "dark_upper_facet_reflection")["color"] = [0.012, 0.012, 0.014, 1]
    variants.append(recipe)

    recipe = common(base, "v143c_original_product_render_black_facet_cards")
    set_all_diamond_adjust(
        recipe,
        {
            "glass_color": [1, 1, 1, 1],
            "glass_color_mix": 0.002,
            "glass_roughness": 0,
            "ior": 2.417,
            "volume_color": [1, 1, 1, 1],
            "volume_color_mix": 0.002,
            "volume_density_scale": 0.04,
            "volume_density_max": 0.04,
            "saturation_scale": 1.12,
            "hsv_value_scale": 0.58,
            "hsv_value_max": 1.14,
            "diffuse_color": [0.78, 0.78, 0.78, 1],
        },
    )
    set_metal(recipe, 0.03, 0.54)
    recipe["render"]["exposure"] = -0.05
    recipe["world"]["strength"] = 0.045
    light(recipe, "large_top_softbox")["power"] = 360
    light(recipe, "left_front_strip")["power"] = 34
    light(recipe, "right_rim_strip")["power"] = 170
    light(recipe, "diamond_sparkle_pin_1")["power"] = 230
    light(recipe, "diamond_sparkle_pin_2")["power"] = 205
    light(recipe, "lower_front_fill")["power"] = 16
    for name in ("dark_lower_reflection", "dark_upper_facet_reflection", "front_low_black_reflection"):
        card(recipe, name)["color"] = [0.004, 0.004, 0.005, 1]
    card(recipe, "dark_upper_facet_reflection")["size"] = [4.0, 1.15]
    card(recipe, "right_black_reflection_wall")["color"] = [0.012, 0.012, 0.014, 1]
    card(recipe, "left_black_reflection_wall")["color"] = [0.012, 0.012, 0.014, 1]
    variants.append(recipe)

    return variants


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in make_variants():
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

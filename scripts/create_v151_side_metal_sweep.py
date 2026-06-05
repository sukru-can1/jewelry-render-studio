from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE = ROOT / "v149d_low_key_platinum_black_cards.json"


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
                    "diffuse_color": color,
                    "metallic": 1,
                    "roughness": roughness,
                    "specular_ior_level": 0.86,
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
        "Side-metal realism pass. Product geometry unchanged. Dark side reflectors and reduced white fill "
        "prevent the shank shoulders from reading as flat white plastic."
    )
    recipe["render"]["samples"] = 360
    recipe["render"]["exposure"] = -0.075
    recipe["render"]["look"] = "High Contrast"
    recipe["world"]["strength"] = 0.018
    recipe["background"]["color"] = [0.785, 0.785, 0.79, 1]
    recipe["postprocess"].pop("diamond_facets", None)
    recipe["postprocess"]["product"].update(
        {
            "contrast": 1.06,
            "brightness": 0.965,
            "saturation": 0.965,
            "sharpness": 1.02,
            "blend": 0.13,
        }
    )
    recipe["postprocess"]["center_stone"].update(
        {
            "contrast": 1.14,
            "brightness": 0.99,
            "sharpness": 1.06,
            "blend": 0.16,
        }
    )
    recipe["reflection_cards"] = [
        item for item in recipe["reflection_cards"] if not item["name"].startswith("center_deep_blue")
    ]
    return recipe


def side_cards(recipe: dict, strength: str) -> None:
    if strength == "balanced":
        dark = [0.018, 0.018, 0.021, 1]
        gray = [0.18, 0.185, 0.195, 1]
        width = 2.0
    elif strength == "strong":
        dark = [0.006, 0.006, 0.008, 1]
        gray = [0.12, 0.125, 0.135, 1]
        width = 2.45
    else:
        dark = [0.028, 0.028, 0.032, 1]
        gray = [0.24, 0.245, 0.255, 1]
        width = 1.75

    card(recipe, "visible_white_backdrop")["color"] = [0.68, 0.68, 0.685, 1]
    card(recipe, "soft_gray_side_reflection")["color"] = gray
    card(recipe, "left_black_reflection_wall")["color"] = dark
    card(recipe, "right_black_reflection_wall")["color"] = dark
    card(recipe, "front_low_black_reflection")["color"] = dark
    card(recipe, "front_low_black_reflection")["size"] = [5.4, 0.78]

    add_card(recipe, "left_shank_side_dark_mirror", [-3.1, -1.35, 0.72], [74, 0, -78], [width, 2.4], dark)
    add_card(recipe, "right_shank_side_dark_mirror", [3.1, -1.35, 0.72], [74, 0, 78], [width, 2.4], dark)
    add_card(recipe, "left_shoulder_gray_breakup", [-2.05, -2.35, 0.92], [78, 0, -42], [1.6, 1.15], gray)
    add_card(recipe, "right_shoulder_gray_breakup", [2.05, -2.35, 0.92], [78, 0, 42], [1.6, 1.15], gray)


def variant(name: str, *, metal: list[float], mix: float, roughness: float, top: float, rim: float, left: float, pins: tuple[float, float], strength: str) -> dict:
    source = json.loads(BASE.read_text(encoding="utf-8-sig"))
    recipe = base_recipe(source, name)
    set_metal(recipe, metal, mix, roughness)
    light(recipe, "large_top_softbox")["power"] = top
    light(recipe, "large_top_softbox")["size"] = 4.8
    light(recipe, "right_rim_strip")["power"] = rim
    light(recipe, "left_front_strip")["power"] = left
    light(recipe, "lower_front_fill")["power"] = 0
    light(recipe, "lower_shadow_lift_pin")["power"] = 0
    light(recipe, "diamond_sparkle_pin_1")["power"] = pins[0]
    light(recipe, "diamond_sparkle_pin_2")["power"] = pins[1]
    side_cards(recipe, strength)
    return recipe


def main() -> None:
    recipes = [
        variant(
            "v151a_ring99_side_metal_balanced",
            metal=[0.43, 0.445, 0.475, 1],
            mix=0.90,
            roughness=0.075,
            top=185,
            rim=220,
            left=10,
            pins=(400, 355),
            strength="balanced",
        ),
        variant(
            "v151b_ring99_side_metal_strong_dark",
            metal=[0.38, 0.395, 0.43, 1],
            mix=0.96,
            roughness=0.085,
            top=155,
            rim=245,
            left=5,
            pins=(430, 380),
            strength="strong",
        ),
        variant(
            "v151c_son2_side_metal_balanced",
            metal=[0.43, 0.445, 0.475, 1],
            mix=0.90,
            roughness=0.075,
            top=185,
            rim=220,
            left=10,
            pins=(400, 355),
            strength="balanced",
        ),
        variant(
            "v151d_son2_side_metal_strong_dark",
            metal=[0.38, 0.395, 0.43, 1],
            mix=0.96,
            roughness=0.085,
            top=155,
            rim=245,
            left=5,
            pins=(430, 380),
            strength="strong",
        ),
        variant(
            "v151e_son2_side_metal_soft_gray",
            metal=[0.48, 0.495, 0.52, 1],
            mix=0.82,
            roughness=0.095,
            top=215,
            rim=175,
            left=16,
            pins=(355, 320),
            strength="soft",
        ),
    ]
    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in recipes:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

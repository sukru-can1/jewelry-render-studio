from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE = ROOT / "v151b_ring99_side_metal_strong_dark.json"


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


def set_metal(recipe: dict, color: list[float], mix: float, roughness: float, specular: float) -> None:
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
                    "specular_ior_level": specular,
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
        "Aggressive side-metal realism pass. Current product/model unchanged. "
        "Designed to remove flat white shank shoulders by darkening the reflected studio."
    )
    recipe["render"]["samples"] = 360
    recipe["render"]["look"] = "Medium High Contrast"
    recipe["world"]["strength"] = 0.010
    recipe["postprocess"]["product"].update(
        {
            "contrast": 1.08,
            "brightness": 0.94,
            "saturation": 0.95,
            "sharpness": 1.015,
            "blend": 0.16,
        }
    )
    recipe["postprocess"]["center_stone"].update(
        {
            "contrast": 1.12,
            "brightness": 0.985,
            "sharpness": 1.05,
            "blend": 0.14,
        }
    )
    return recipe


def tune_cards(recipe: dict, *, backdrop: float, dark: float, gray: float, width: float) -> None:
    recipe["background"]["color"] = [backdrop, backdrop, backdrop + 0.005, 1]
    card(recipe, "visible_white_backdrop")["color"] = [backdrop * 0.78, backdrop * 0.78, backdrop * 0.785, 1]
    card(recipe, "soft_gray_side_reflection")["color"] = [gray, gray, gray + 0.012, 1]
    for name in ("left_black_reflection_wall", "right_black_reflection_wall", "front_low_black_reflection", "dark_lower_reflection"):
        card(recipe, name)["color"] = [dark, dark, dark + 0.002, 1]
    for name in ("left_shank_side_dark_mirror", "right_shank_side_dark_mirror"):
        card(recipe, name)["size"] = [width, 2.8]
        card(recipe, name)["color"] = [dark, dark, dark + 0.002, 1]
    add_card(recipe, "low_left_black_band_reflection", [-2.6, -2.65, 0.38], [88, 0, -38], [2.8, 0.75], [dark, dark, dark + 0.002, 1])
    add_card(recipe, "low_right_black_band_reflection", [2.6, -2.65, 0.38], [88, 0, 38], [2.8, 0.75], [dark, dark, dark + 0.002, 1])


def variant(name: str, *, metal: list[float], roughness: float, exposure: float, top: float, rim: float, left: float, backdrop: float, dark: float, gray: float, width: float) -> dict:
    source = json.loads(BASE.read_text(encoding="utf-8-sig"))
    recipe = base_recipe(source, name)
    recipe["render"]["exposure"] = exposure
    set_metal(recipe, metal, 0.98, roughness, 0.76)
    light(recipe, "large_top_softbox")["power"] = top
    light(recipe, "large_top_softbox")["size"] = 4.2
    light(recipe, "right_rim_strip")["power"] = rim
    light(recipe, "left_front_strip")["power"] = left
    light(recipe, "lower_front_fill")["power"] = 0
    light(recipe, "lower_shadow_lift_pin")["power"] = 0
    tune_cards(recipe, backdrop=backdrop, dark=dark, gray=gray, width=width)
    return recipe


def main() -> None:
    recipes = [
        variant("v152a_side_metal_real_gray", metal=[0.34, 0.355, 0.39, 1], roughness=0.14, exposure=-0.105, top=115, rim=210, left=8, backdrop=0.74, dark=0.004, gray=0.14, width=2.9),
        variant("v152b_side_metal_split_reflection", metal=[0.38, 0.395, 0.425, 1], roughness=0.12, exposure=-0.095, top=135, rim=230, left=5, backdrop=0.76, dark=0.006, gray=0.12, width=3.1),
        variant("v152c_side_metal_less_blowout", metal=[0.42, 0.435, 0.46, 1], roughness=0.16, exposure=-0.085, top=150, rim=185, left=12, backdrop=0.78, dark=0.010, gray=0.18, width=2.6),
        variant("v152d_side_metal_low_key", metal=[0.32, 0.335, 0.37, 1], roughness=0.11, exposure=-0.115, top=95, rim=260, left=3, backdrop=0.72, dark=0.003, gray=0.10, width=3.2),
        variant("v152e_side_metal_clean_platinum", metal=[0.46, 0.475, 0.50, 1], roughness=0.18, exposure=-0.075, top=175, rim=165, left=18, backdrop=0.80, dark=0.016, gray=0.22, width=2.35),
    ]
    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in recipes:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

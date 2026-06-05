from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v162a_son2_glossy_only_lower_reflection.json"


def main() -> None:
    recipe = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    recipe = copy.deepcopy(recipe)
    recipe["name"] = "v171a_son2_recover_silver_shank_clean_bottom"
    recipe["description"] = (
        "Recover from dark/malformed lower metal by returning to higher-camera silver-shank setup, "
        "using smooth studio background, no contact shadow overlays, and no lower-prong darkening masks."
    )
    recipe["render"]["samples"] = 780
    recipe["render"]["exposure"] = -0.17
    recipe["camera"].update(
        {
            "position": [0.0, -5.18, 1.68],
            "target": [0.0, 0.0, 0.24],
            "focal_length": 84,
            "shift_y": 0.018,
        }
    )
    recipe["model"]["ground_clearance"] = 0.13
    recipe["world"]["strength"] = 0.0042
    recipe["contact_shadows"] = []

    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        adjust = rule.setdefault("source_material_adjust", {})
        if "prong" in tokens or "object_" in tokens:
            adjust["base_color"] = [0.38, 0.395, 0.425, 1.0]
            adjust["diffuse_color"] = [0.38, 0.395, 0.425, 1.0]
            adjust["roughness"] = 0.2
            adjust["specular_ior_level"] = 0.58
        if "diamond_round_11" in tokens:
            adjust["hsv_value_scale"] = 0.56
            adjust["glass_color_mix"] = 0.15

    for card in recipe.get("reflection_cards", []):
        name = card.get("name", "")
        if name == "front_low_black_reflection":
            card["color"] = [0.075, 0.078, 0.086, 1.0]
            card["position"] = [0.0, -2.25, 0.36]
            card["size"] = [4.6, 0.48]
        elif name in {"left_side_dark_mirror", "right_side_dark_mirror"}:
            card["color"] = [0.055, 0.058, 0.066, 1.0]
        elif name in {"left_shoulder_gray_break", "right_shoulder_gray_break"}:
            card["color"] = [0.16, 0.165, 0.175, 1.0]
        elif name == "upper_facet_dark_card":
            card["color"] = [0.04, 0.043, 0.05, 1.0]
            card["size"] = [3.6, 0.95]
        elif name == "glossy_only_lower_stone_gray_reflector":
            card["color"] = [0.13, 0.135, 0.145, 1.0]
            card["size"] = [1.1, 0.2]

    recipe["postprocess"]["studio_background"] = {
        "enabled": True,
        "top_color": [248, 248, 247],
        "floor_color": [240, 240, 238],
        "floor_start": 0.16,
        "floor_strength": 0.24,
        "vignette": 4.5,
        "mask_cutoff": 0.35,
        "object_padding_px": 12,
        "object_feather": 3.0,
        "bright_object_keep": 0.58,
        "protect_feather": 1.2,
        "fallback_product_bounds_norm": [0.02, 0.49, 0.98, 0.96],
        "shadow_blur": 28.0,
        "shadows": [
            {"cx": 0.50, "cy": 0.83, "rx": 0.42, "ry": 0.05, "alpha": 15},
            {"cx": 0.50, "cy": 0.858, "rx": 0.24, "ry": 0.028, "alpha": 6},
        ],
    }
    recipe["postprocess"]["product"].update({"brightness": 0.95, "contrast": 1.04, "blend": 0.075})
    recipe["postprocess"]["center_stone"].update(
        {"brightness": 0.975, "contrast": 1.17, "sharpness": 1.1, "blend": 0.21, "detail_amount": 0.1}
    )
    recipe["postprocess"]["side_soften"] = {"enabled": False}
    recipe["postprocess"]["final_regions"] = {"enabled": False}
    recipe["postprocess"]["diamond_facets"] = {"enabled": False}

    path = ROOT / f"{recipe['name']}.json"
    path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()

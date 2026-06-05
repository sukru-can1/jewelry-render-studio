from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v180b_son2_center_dimond_shader.json"


PRODUCT_TOKENS = [
    "Diamond_Round",
    "Prong",
    "MASTER_SCENE_realistic_polished_gold",
    "Shiny Gold",
]


ANGLES = [
    ("v183a_son2_product_front_original_grade", [0, 0, 0]),
    ("v183b_son2_product_rotated_left_32", [0, 0, 32]),
    ("v183c_son2_product_rotated_right_32", [0, 0, -32]),
    ("v183d_son2_product_rotated_left_55_low_tilt", [-8, 0, 55]),
    ("v183e_son2_product_rotated_right_55_high_tilt", [8, 0, -55]),
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for name, rotation in ANGLES:
        recipe = copy.deepcopy(base)
        recipe["name"] = name
        recipe["description"] = "True angle sweep from v180b: source studio/camera preserved, product meshes rotated as one group."
        recipe["render"]["samples"] = 700
        recipe["source_scene"].pop("use_recipe_camera", None)
        recipe["source_scene"]["group_adjustments"] = [
            {
                "contains": PRODUCT_TOKENS,
                "rotation_degrees": rotation,
            }
        ]
        center = recipe["postprocess"]["center_stone"]
        center["object_contains"] = ["Diamond_Round_11"]
        center["padding_px"] = 30
        center["fallback_bounds_norm"] = [0.34, 0.18, 0.66, 0.52]
        path = ROOT / f"{name}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

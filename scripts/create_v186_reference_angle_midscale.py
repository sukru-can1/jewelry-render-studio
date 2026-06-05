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
    {
        "name": "v186a_ref_mid_upper_left",
        "rotation_degrees": [0, 0, 34],
        "scale": 0.90,
        "translation": [-0.015, 0.0, 0.0],
    },
    {
        "name": "v186b_ref_mid_low_front",
        "rotation_degrees": [-22, 0, -18],
        "scale": 0.90,
        "translation": [0.0, 0.0, -0.01],
    },
    {
        "name": "v186c_ref_mid_ring_circle",
        "rotation_degrees": [0, 0, -32],
        "scale": 0.88,
        "translation": [0.0, 0.0, -0.01],
    },
    {
        "name": "v186d_ref_mid_vertical_side",
        "rotation_degrees": [2, 0, -92],
        "scale": 0.90,
        "translation": [0.015, 0.0, -0.01],
    },
    {
        "name": "v186e_ref_mid_opposite_side",
        "rotation_degrees": [2, 0, 88],
        "scale": 0.90,
        "translation": [-0.015, 0.0, -0.01],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for angle in ANGLES:
        recipe = copy.deepcopy(base)
        recipe["name"] = angle["name"]
        recipe["description"] = "Mid-scale reference-angle candidate: product group rotated with moderate whitespace."
        recipe["render"]["samples"] = 620
        recipe["source_scene"].pop("use_recipe_camera", None)
        recipe["source_scene"]["group_adjustments"] = [
            {
                "contains": PRODUCT_TOKENS,
                "rotation_degrees": angle["rotation_degrees"],
                "scale": angle["scale"],
                "translation": angle["translation"],
            }
        ]
        center = recipe["postprocess"]["center_stone"]
        center["object_contains"] = ["Diamond_Round_11"]
        center["padding_px"] = 28
        center["fallback_bounds_norm"] = [0.34, 0.18, 0.66, 0.52]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

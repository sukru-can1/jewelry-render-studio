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
        "name": "v184a_ref_upper_left_threequarter",
        "description": "Reference angle: upper-left style elevated three-quarter product view.",
        "rotation_degrees": [0, 0, 34],
    },
    {
        "name": "v184b_ref_upper_right_upright_front",
        "description": "Reference angle: upright front ring profile with stone at top.",
        "rotation_degrees": [-4, 0, 82],
    },
    {
        "name": "v184c_ref_lower_left_low_front",
        "description": "Reference angle: lower-left low front view with stone forward and band behind.",
        "rotation_degrees": [-22, 0, -18],
    },
    {
        "name": "v184d_ref_lower_right_vertical_side",
        "description": "Reference angle: lower-right vertical side/profile view.",
        "rotation_degrees": [10, 0, -74],
    },
    {
        "name": "v184e_ref_clean_side_profile",
        "description": "Reference angle: cleaner side profile, less extreme than vertical side.",
        "rotation_degrees": [2, 0, -92],
    },
    {
        "name": "v184f_ref_top_ring_circle",
        "description": "Reference angle: top/front ring circle catalog profile candidate.",
        "rotation_degrees": [-12, 0, 104],
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for angle in ANGLES:
        recipe = copy.deepcopy(base)
        recipe["name"] = angle["name"]
        recipe["description"] = angle["description"]
        recipe["render"]["samples"] = 620
        recipe["source_scene"].pop("use_recipe_camera", None)
        recipe["source_scene"]["group_adjustments"] = [
            {
                "contains": PRODUCT_TOKENS,
                "rotation_degrees": angle["rotation_degrees"],
            }
        ]
        center = recipe["postprocess"]["center_stone"]
        center["object_contains"] = ["Diamond_Round_11"]
        center["padding_px"] = 30
        center["fallback_bounds_norm"] = [0.34, 0.18, 0.66, 0.52]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

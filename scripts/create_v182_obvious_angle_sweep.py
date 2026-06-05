from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v180b_son2_center_dimond_shader.json"


ANGLES = [
    {
        "name": "v182a_son2_obvious_front_low",
        "camera": {
            "position": [0.0, -3.9, 0.95],
            "target": [0.0, 0.0, 0.22],
            "focal_length": 76,
            "shift_y": 0.02,
            "depth_of_field": {"enabled": True, "f_stop": 10},
        },
    },
    {
        "name": "v182b_son2_obvious_left_side",
        "camera": {
            "position": [3.0, -3.4, 1.25],
            "target": [0.0, 0.0, 0.22],
            "focal_length": 78,
            "shift_y": 0.01,
            "depth_of_field": {"enabled": True, "f_stop": 10},
        },
    },
    {
        "name": "v182c_son2_obvious_right_side",
        "camera": {
            "position": [-3.0, -3.4, 1.25],
            "target": [0.0, 0.0, 0.22],
            "focal_length": 78,
            "shift_y": 0.01,
            "depth_of_field": {"enabled": True, "f_stop": 10},
        },
    },
    {
        "name": "v182d_son2_obvious_top_down",
        "camera": {
            "position": [0.25, -3.2, 3.15],
            "target": [0.0, 0.0, 0.24],
            "focal_length": 82,
            "shift_y": -0.05,
            "depth_of_field": {"enabled": True, "f_stop": 12},
        },
    },
    {
        "name": "v182e_son2_obvious_front_steep_close",
        "camera": {
            "position": [0.0, -3.0, 1.85],
            "target": [0.0, 0.0, 0.18],
            "focal_length": 70,
            "shift_y": -0.03,
            "depth_of_field": {"enabled": True, "f_stop": 10},
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for angle in ANGLES:
        recipe = copy.deepcopy(base)
        recipe["name"] = angle["name"]
        recipe["description"] = "Obvious angle sweep from v180b best diamond setup, using source studio/materials and wide recipe camera."
        recipe["render"]["samples"] = 640
        recipe["source_scene"]["use_recipe_camera"] = True
        recipe["camera"] = angle["camera"]
        center = recipe["postprocess"]["center_stone"]
        center["object_contains"] = ["Diamond_Round_11"]
        center["padding_px"] = 28
        center["fallback_bounds_norm"] = [0.32, 0.16, 0.68, 0.54]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

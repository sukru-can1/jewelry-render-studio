from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v180b_son2_center_dimond_shader.json"


ANGLES = [
    {
        "name": "v181a_son2_angle_front_lower",
        "camera": {
            "position": [0.0, -5.25, 1.42],
            "target": [0.0, 0.0, 0.20],
            "focal_length": 112,
            "shift_y": 0.0,
            "depth_of_field": {"enabled": True, "f_stop": 11},
        },
    },
    {
        "name": "v181b_son2_angle_left_threequarter",
        "camera": {
            "position": [1.15, -5.15, 1.56],
            "target": [0.0, 0.0, 0.20],
            "focal_length": 112,
            "shift_y": 0.0,
            "depth_of_field": {"enabled": True, "f_stop": 11},
        },
    },
    {
        "name": "v181c_son2_angle_right_threequarter",
        "camera": {
            "position": [-1.15, -5.15, 1.56],
            "target": [0.0, 0.0, 0.20],
            "focal_length": 112,
            "shift_y": 0.0,
            "depth_of_field": {"enabled": True, "f_stop": 11},
        },
    },
    {
        "name": "v181d_son2_angle_left_higher",
        "camera": {
            "position": [1.55, -5.05, 1.90],
            "target": [0.0, 0.0, 0.22],
            "focal_length": 118,
            "shift_y": -0.02,
            "depth_of_field": {"enabled": True, "f_stop": 12},
        },
    },
    {
        "name": "v181e_son2_angle_right_lower_close",
        "camera": {
            "position": [-1.45, -5.05, 1.28],
            "target": [0.0, 0.0, 0.18],
            "focal_length": 118,
            "shift_y": 0.02,
            "depth_of_field": {"enabled": True, "f_stop": 12},
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for angle in ANGLES:
        recipe = copy.deepcopy(base)
        recipe["name"] = angle["name"]
        recipe["description"] = "Angle sweep from v180b best diamond setup, using source studio/materials and recipe camera."
        recipe["render"]["samples"] = 720
        recipe["source_scene"]["use_recipe_camera"] = True
        recipe["camera"] = angle["camera"]
        center = recipe["postprocess"]["center_stone"]
        center["object_contains"] = ["Diamond_Round_11"]
        center["padding_px"] = 22
        center["fallback_bounds_norm"] = [0.35, 0.19, 0.65, 0.50]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

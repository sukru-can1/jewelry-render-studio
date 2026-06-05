from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v201_physical_cards_final_left_facet_break.json"


ANGLES = [
    {
        "name": "v202a_angle_front_low_hero",
        "label": "front low hero",
        "camera_orbit": {
            "enabled": True,
            "target_contains": ["Diamond_Round_11"],
            "yaw_degrees": 0,
            "height_scale": 0.9,
            "distance_scale": 1.02,
            "target_offset": [0.0, 0.0, -0.006],
            "focal_length": 76,
            "shift_y": -0.025,
        },
        "exposure": -0.96,
    },
    {
        "name": "v202b_angle_left_three_quarter",
        "label": "left three-quarter",
        "camera_orbit": {
            "enabled": True,
            "target_contains": ["Diamond_Round_11"],
            "yaw_degrees": -42,
            "height_scale": 0.98,
            "distance_scale": 1.1,
            "target_offset": [0.0, 0.0, -0.004],
            "focal_length": 74,
            "shift_x": 0.02,
            "shift_y": -0.01,
        },
        "exposure": -0.97,
    },
    {
        "name": "v202c_angle_right_three_quarter",
        "label": "right three-quarter",
        "camera_orbit": {
            "enabled": True,
            "target_contains": ["Diamond_Round_11"],
            "yaw_degrees": 42,
            "height_scale": 0.98,
            "distance_scale": 1.1,
            "target_offset": [0.0, 0.0, -0.004],
            "focal_length": 74,
            "shift_x": -0.02,
            "shift_y": -0.01,
        },
        "exposure": -0.97,
    },
    {
        "name": "v202d_angle_side_profile",
        "label": "side profile",
        "camera_orbit": {
            "enabled": True,
            "target_contains": ["Diamond_Round_11"],
            "yaw_degrees": 86,
            "height_scale": 0.94,
            "distance_scale": 1.17,
            "target_offset": [0.0, 0.0, -0.004],
            "focal_length": 78,
            "shift_y": -0.02,
        },
        "exposure": -0.98,
    },
    {
        "name": "v202e_angle_upper_catalog",
        "label": "upper catalog",
        "camera_orbit": {
            "enabled": True,
            "target_contains": ["Diamond_Round_11"],
            "yaw_degrees": -26,
            "height_scale": 1.36,
            "distance_scale": 1.13,
            "target_offset": [0.0, 0.0, -0.004],
            "focal_length": 82,
            "shift_y": 0.02,
        },
        "exposure": -0.95,
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for angle in ANGLES:
        recipe = copy.deepcopy(base)
        recipe["name"] = angle["name"]
        recipe["description"] = (
            f"v202 angle set from v201 physical-card studio: {angle['label']}. "
            "Only camera/framing changes; product, lighting, materials and reflection cards are preserved."
        )
        recipe["source_scene"]["camera_orbit"] = angle["camera_orbit"]
        recipe["render"]["resolution"] = [1100, 1100]
        recipe["render"]["samples"] = 680
        recipe["render"]["exposure"] = angle["exposure"]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

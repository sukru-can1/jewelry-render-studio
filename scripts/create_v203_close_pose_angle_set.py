from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v201_physical_cards_final_left_facet_break.json"

PRODUCT_TOKENS = [
    "Diamond_Round",
    "Prong",
    "MASTER_SCENE_realistic_polished_gold",
    "Shiny Gold",
]


POSES = [
    {
        "name": "v203a_close_front_hero",
        "label": "close front hero",
        "rotation": [-16, 0, -16],
        "scale": 0.95,
        "translation": [0.0, 0.0, -0.01],
        "exposure": -0.94,
    },
    {
        "name": "v203b_close_catalog_left",
        "label": "close catalog left angle",
        "rotation": [0, 0, -34],
        "scale": 0.91,
        "translation": [-0.004, 0.0, -0.01],
        "exposure": -0.95,
    },
    {
        "name": "v203c_close_catalog_right",
        "label": "close catalog right angle",
        "rotation": [0, 0, 34],
        "scale": 0.91,
        "translation": [0.004, 0.0, -0.01],
        "exposure": -0.95,
    },
    {
        "name": "v203d_close_low_side",
        "label": "close low side profile",
        "rotation": [-7, 0, -74],
        "scale": 0.88,
        "translation": [0.0, 0.0, -0.008],
        "exposure": -0.96,
    },
    {
        "name": "v203e_close_upper_ring_shape",
        "label": "close upper ring shape",
        "rotation": [12, 0, -26],
        "scale": 0.9,
        "translation": [0.0, 0.0, -0.006],
        "exposure": -0.93,
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for pose in POSES:
        recipe = copy.deepcopy(base)
        recipe["name"] = pose["name"]
        recipe["description"] = (
            f"v203 close angle set from v201 physical-card studio: {pose['label']}. "
            "The close source camera/studio is preserved; product pose changes create alternate catalog angles."
        )
        recipe["source_scene"].pop("camera_orbit", None)
        recipe["source_scene"]["group_adjustments"] = [
            {
                "contains": PRODUCT_TOKENS,
                "rotation_degrees": pose["rotation"],
                "scale": pose["scale"],
                "translation": pose["translation"],
            }
        ]
        recipe["render"]["resolution"] = [1100, 1100]
        recipe["render"]["samples"] = 680
        recipe["render"]["exposure"] = pose["exposure"]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v193a_front_depth_oval_band.json"


def set_lights(recipe: dict, front: float, fill: float, top: float, sparkle: float, dark: float, gray: float, dark_strength: float) -> None:
    recipe["source_scene"]["light_adjustments"] = [
        {"contains": ["large_front_left_softbox"], "power_scale": front},
        {"contains": ["weak_front_right_fill"], "power_scale": fill},
        {"contains": ["low_top_softbox"], "power_scale": top},
        {"contains": ["diamond_micro_sparkle"], "power_scale": sparkle, "color": [0.93, 0.975, 1.0]},
    ]
    recipe["source_scene"]["object_adjustments"] = [
        {
            "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
            "source_material_adjust": {
                "base_color": [dark, dark, dark + 0.003, 1.0],
                "diffuse_color": [dark, dark, dark + 0.003, 1.0],
                "emission_color": [dark, dark, dark + 0.003, 1.0],
                "emission_strength_scale": dark_strength,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.014, 1.0],
                "diffuse_color": [gray, gray, gray + 0.014, 1.0],
                "emission_color": [gray, gray, gray + 0.014, 1.0],
                "emission_strength_scale": 0.82,
            },
        },
    ]


def set_group(recipe: dict, rotation: list[float], scale: float) -> None:
    recipe["source_scene"].pop("camera_orbit", None)
    recipe["source_scene"]["group_adjustments"][0]["rotation_degrees"] = rotation
    recipe["source_scene"]["group_adjustments"][0]["scale"] = scale
    recipe["source_scene"]["group_adjustments"][0]["translation"] = [0.0, 0.0, -0.01]


def tune_center(recipe: dict, value: float, max_value: float, contrast: float, brightness: float, detail: float, blend: float) -> None:
    for material in recipe.get("material_map", []):
        if "Diamond_Round_11" in material.get("contains", []):
            adjust = material.setdefault("source_material_adjust", {})
            adjust["hsv_value_scale"] = value
            adjust["hsv_value_max"] = max_value
            adjust["saturation_scale"] = 0.92
    center = recipe["postprocess"]["center_stone"]
    center.update(
        {
            "contrast": contrast,
            "brightness": brightness,
            "detail_amount": detail,
            "blend": blend,
            "autocontrast_cutoff": 0.72,
            "saturation": 0.88,
            "mask_feather": 12,
        }
    )


VARIANTS = [
    {
        "name": "v194a_balanced_fill_less_milk",
        "rotation": [-16, 0, -16],
        "scale": 0.95,
        "exposure": -0.94,
        "lights": (0.86, 0.58, 0.54, 2.04, 0.010, 0.30, 0.60),
        "stone": (0.50, 0.84, 1.72, 0.91, 0.28, 0.56),
    },
    {
        "name": "v194b_symmetric_clearer_table",
        "rotation": [-16, 0, -16],
        "scale": 0.95,
        "exposure": -0.96,
        "lights": (0.80, 0.62, 0.50, 2.18, 0.008, 0.26, 0.66),
        "stone": (0.47, 0.82, 1.82, 0.90, 0.32, 0.58),
    },
    {
        "name": "v194c_softer_no_milky_side",
        "rotation": [-17, 0, -15],
        "scale": 0.95,
        "exposure": -0.93,
        "lights": (0.88, 0.54, 0.58, 1.96, 0.011, 0.32, 0.58),
        "stone": (0.52, 0.85, 1.66, 0.92, 0.24, 0.54),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v194 milky-side fix: balance key/fill and reduce broad white reflection on center diamond."
        recipe["render"]["samples"] = 840
        recipe["render"]["exposure"] = variant["exposure"]
        set_group(recipe, variant["rotation"], variant["scale"])
        set_lights(recipe, *variant["lights"])
        tune_center(recipe, *variant["stone"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")


RECIPES = [
    {
        "name": "v173a_son2_source_scene_exact",
        "description": "Open son2.blend directly and preserve its camera, lights, world/HDRI, materials, floor, and studio setup.",
        "source_scene": {
            "enabled": True,
            "metadata_exclude_contains": ["camera", "light"],
        },
        "render": {
            "resolution": [1200, 1200],
            "samples": 520,
            "denoise": True,
            "transparent": False,
            "view_transform": "Filmic",
            "look": "Medium High Contrast",
            "exposure": 0.0,
            "gamma": 1.0,
        },
        "postprocess": {},
    },
    {
        "name": "v173b_son2_source_scene_slightly_darker",
        "description": "Same direct source-scene render, with a small exposure reduction to protect diamond highlights.",
        "source_scene": {
            "enabled": True,
            "metadata_exclude_contains": ["camera", "light"],
        },
        "render": {
            "resolution": [1200, 1200],
            "samples": 520,
            "denoise": True,
            "transparent": False,
            "view_transform": "Filmic",
            "look": "Medium High Contrast",
            "exposure": -0.22,
            "gamma": 1.0,
        },
        "postprocess": {},
    },
    {
        "name": "v174a_son2_source_studio_white_gold",
        "description": "Use son2.blend camera/lights/world/studio, but convert source gold materials to white gold.",
        "source_scene": {
            "enabled": True,
            "apply_recipe_materials": True,
            "metadata_exclude_contains": ["camera", "light"],
        },
        "material_strategy": "hybrid",
        "material_map": [
            {
                "contains": ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"],
                "source_material": "MASTER_SCENE_realistic_polished_gold",
                "source_material_adjust": {
                    "base_color": [0.48, 0.495, 0.525, 1.0],
                    "base_color_mix": 1.0,
                    "diffuse_color": [0.48, 0.495, 0.525, 1.0],
                    "metallic": 1.0,
                    "roughness": 0.19,
                    "specular_ior_level": 0.62,
                },
            }
        ],
        "render": {
            "resolution": [1200, 1200],
            "samples": 560,
            "denoise": True,
            "transparent": False,
            "view_transform": "Filmic",
            "look": "Medium High Contrast",
            "exposure": -0.08,
            "gamma": 1.0,
        },
        "postprocess": {},
    },
    {
        "name": "v174b_son2_source_studio_white_gold_more_contrast",
        "description": "Use source studio and white gold material, with darker exposure for stronger diamond contrast.",
        "source_scene": {
            "enabled": True,
            "apply_recipe_materials": True,
            "metadata_exclude_contains": ["camera", "light"],
        },
        "material_strategy": "hybrid",
        "material_map": [
            {
                "contains": ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"],
                "source_material": "MASTER_SCENE_realistic_polished_gold",
                "source_material_adjust": {
                    "base_color": [0.42, 0.435, 0.465, 1.0],
                    "base_color_mix": 1.0,
                    "diffuse_color": [0.42, 0.435, 0.465, 1.0],
                    "metallic": 1.0,
                    "roughness": 0.22,
                    "specular_ior_level": 0.58,
                },
            }
        ],
        "render": {
            "resolution": [1200, 1200],
            "samples": 560,
            "denoise": True,
            "transparent": False,
            "view_transform": "Filmic",
            "look": "Medium High Contrast",
            "exposure": -0.18,
            "gamma": 1.0,
        },
        "postprocess": {},
    },
]


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for recipe in RECIPES:
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

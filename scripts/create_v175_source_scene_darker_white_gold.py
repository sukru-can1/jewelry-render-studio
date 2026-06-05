from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v174a_son2_source_studio_white_gold.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


VARIANTS = [
    {
        "name": "v175a_son2_source_white_gold_exposure_down",
        "render": {
            "samples": 620,
            "exposure": -0.34,
            "look": "Medium High Contrast",
        },
        "metal": {
            "base_color": [0.40, 0.415, 0.445, 1.0],
            "roughness": 0.23,
            "specular_ior_level": 0.56,
        },
    },
    {
        "name": "v175b_son2_source_white_gold_deeper_diamond",
        "render": {
            "samples": 620,
            "exposure": -0.48,
            "look": "Medium High Contrast",
        },
        "metal": {
            "base_color": [0.36, 0.375, 0.405, 1.0],
            "roughness": 0.25,
            "specular_ior_level": 0.52,
        },
    },
    {
        "name": "v175c_son2_source_white_gold_balanced_less_wash",
        "render": {
            "samples": 620,
            "exposure": -0.40,
            "look": "Medium High Contrast",
        },
        "metal": {
            "base_color": [0.43, 0.445, 0.475, 1.0],
            "roughness": 0.24,
            "specular_ior_level": 0.54,
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        metal = variant.pop("metal")
        recipe = deep_merge(base, variant)
        recipe["description"] = (
            "Source-scene studio preserved, with darker exposure and less bright white-gold override "
            "to recover diamond and pave contrast."
        )
        adjust = recipe["material_map"][0]["source_material_adjust"]
        adjust["base_color"] = metal["base_color"]
        adjust["diffuse_color"] = metal["base_color"]
        adjust["roughness"] = metal["roughness"]
        adjust["specular_ior_level"] = metal["specular_ior_level"]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

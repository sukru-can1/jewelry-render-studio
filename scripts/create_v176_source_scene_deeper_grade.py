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
        "name": "v176a_son2_source_white_gold_deeper_grade",
        "render": {"samples": 640, "exposure": -0.62, "look": "Medium High Contrast"},
        "metal": {"base_color": [0.34, 0.355, 0.385, 1.0], "roughness": 0.26, "specular_ior_level": 0.50},
    },
    {
        "name": "v176b_son2_source_white_gold_deep_but_clean",
        "render": {"samples": 640, "exposure": -0.72, "look": "Medium High Contrast"},
        "metal": {"base_color": [0.32, 0.335, 0.365, 1.0], "roughness": 0.28, "specular_ior_level": 0.48},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        metal = variant.pop("metal")
        recipe = deep_merge(base, variant)
        recipe["description"] = (
            "Source-scene studio preserved, deeper exposure grade to reduce high-key wash "
            "and recover diamond/pave contrast."
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

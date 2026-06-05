from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v159b_son2_lower_stone_tamed.json"


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def tune_metal(recipe: dict, *, base_color: list[float], roughness: float, specular: float) -> None:
    for rule in recipe.get("material_map", []):
        tokens = [token.lower() for token in rule.get("contains", [])]
        if "prong" not in tokens and "object_" not in tokens:
            continue
        adjust = rule.setdefault("source_material_adjust", {})
        adjust["base_color"] = base_color
        adjust["diffuse_color"] = base_color
        adjust["roughness"] = roughness
        adjust["specular_ior_level"] = specular


def side_flash_mask(*, brightness: float, contrast: float, blend: float) -> dict:
    return {
        "enabled": True,
        "regions_norm": [
            [0.35, 0.635, 0.65, 0.842],
            [0.085, 0.545, 0.36, 0.735],
            [0.64, 0.545, 0.915, 0.735],
        ],
        "blur_radius": 0.45,
        "brightness": brightness,
        "contrast": contrast,
        "saturation": 0.9,
        "blend": blend,
        "mask_feather": 30,
        "mask_shape": "ellipse",
    }


VARIANTS = [
    {
        "name": "v160a_son2_tamed_stone_tamed_metal_flash",
        "render": {"samples": 600, "exposure": -0.19},
        "world": {"color": [0.63, 0.63, 0.635], "strength": 0.0035},
        "background": {"color": [0.63, 0.63, 0.635, 1.0]},
        "postprocess": {
            "product": {"brightness": 0.925, "contrast": 1.055, "blend": 0.11},
            "side_soften": side_flash_mask(brightness=0.78, contrast=1.08, blend=0.2),
        },
        "metal": {"base_color": [0.285, 0.3, 0.33, 1.0], "roughness": 0.22, "specular": 0.56},
    },
    {
        "name": "v160b_son2_less_aggressive_flash_control",
        "render": {"samples": 600, "exposure": -0.18},
        "world": {"color": [0.645, 0.645, 0.65], "strength": 0.004},
        "background": {"color": [0.645, 0.645, 0.65, 1.0]},
        "postprocess": {
            "product": {"brightness": 0.932, "contrast": 1.055, "blend": 0.1},
            "side_soften": side_flash_mask(brightness=0.84, contrast=1.05, blend=0.16),
        },
        "metal": {"base_color": [0.305, 0.32, 0.35, 1.0], "roughness": 0.2, "specular": 0.6},
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        metal = variant.pop("metal")
        recipe = deep_merge(base, variant)
        tune_metal(recipe, **metal)
        recipe["description"] = (
            "son2 v160 refinement from v159b. Tames lower stone shine and reduces white flashing on "
            "the shank shoulders while keeping polished-metal contrast."
        )
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

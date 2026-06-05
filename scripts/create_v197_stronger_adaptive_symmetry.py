from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v193a_front_depth_oval_band.json"


VARIANTS = [
    {
        "name": "v197a_smart_symmetry_visible",
        "strength": 0.62,
        "max_strength": 0.70,
        "contrast": 1.34,
        "brightness": 0.97,
        "cutoff": 0.34,
        "adaptive": True,
    },
    {
        "name": "v197b_smart_symmetry_strong",
        "strength": 0.78,
        "max_strength": 0.82,
        "contrast": 1.42,
        "brightness": 0.955,
        "cutoff": 0.42,
        "adaptive": True,
    },
    {
        "name": "v197c_smart_forced_left_clean",
        "strength": 0.62,
        "max_strength": 0.70,
        "contrast": 1.32,
        "brightness": 0.98,
        "cutoff": 0.30,
        "adaptive": False,
        "target_side": "left",
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v197 stronger smart-studio symmetry pass: detector targets milky side and applies visible adaptive half-stone clarity correction."
        recipe["render"]["samples"] = 840
        recipe["postprocess"]["center_stone_symmetry"] = {
            "enabled": True,
            "object_contains": ["Diamond_Round_11"],
            "fallback_bounds_norm": [0.33, 0.22, 0.67, 0.58],
            "padding_px": 26,
            "target_side": variant.get("target_side", "auto"),
            "strength": variant["strength"],
            "max_strength": variant["max_strength"],
            "adaptive_strength": variant["adaptive"],
            "contrast": variant["contrast"],
            "brightness": variant["brightness"],
            "saturation": 0.88,
            "sharpness": 1.24,
            "autocontrast_cutoff": variant["cutoff"],
            "unsharp_radius": 0.9,
            "unsharp_percent": 115,
            "unsharp_threshold": 1,
            "mask_feather": 12,
            "split_feather": 16,
            "min_clarity_delta": 0.0,
            "min_mean_delta": 0.0,
        }
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

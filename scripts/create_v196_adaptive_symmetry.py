from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v193a_front_depth_oval_band.json"


VARIANTS = [
    {
        "name": "v196a_adaptive_auto_symmetry_subtle",
        "symmetry": {
            "enabled": True,
            "object_contains": ["Diamond_Round_11"],
            "fallback_bounds_norm": [0.33, 0.22, 0.67, 0.58],
            "padding_px": 26,
            "target_side": "auto",
            "strength": 0.34,
            "max_strength": 0.46,
            "adaptive_strength": True,
            "contrast": 1.22,
            "brightness": 0.99,
            "saturation": 0.90,
            "sharpness": 1.18,
            "autocontrast_cutoff": 0.22,
            "unsharp_radius": 0.9,
            "unsharp_percent": 95,
            "unsharp_threshold": 1,
            "mask_feather": 12,
            "split_feather": 16,
            "min_clarity_delta": 0.3,
            "min_mean_delta": 1.0,
        },
    },
    {
        "name": "v196b_adaptive_auto_symmetry_medium",
        "symmetry": {
            "enabled": True,
            "object_contains": ["Diamond_Round_11"],
            "fallback_bounds_norm": [0.33, 0.22, 0.67, 0.58],
            "padding_px": 26,
            "target_side": "auto",
            "strength": 0.46,
            "max_strength": 0.56,
            "adaptive_strength": True,
            "contrast": 1.28,
            "brightness": 0.982,
            "saturation": 0.90,
            "sharpness": 1.22,
            "autocontrast_cutoff": 0.28,
            "unsharp_radius": 0.9,
            "unsharp_percent": 110,
            "unsharp_threshold": 1,
            "mask_feather": 12,
            "split_feather": 16,
            "min_clarity_delta": 0.2,
            "min_mean_delta": 0.7,
        },
    },
    {
        "name": "v196c_adaptive_forced_left_validation",
        "symmetry": {
            "enabled": True,
            "object_contains": ["Diamond_Round_11"],
            "fallback_bounds_norm": [0.33, 0.22, 0.67, 0.58],
            "padding_px": 26,
            "target_side": "left",
            "strength": 0.40,
            "max_strength": 0.50,
            "adaptive_strength": False,
            "contrast": 1.24,
            "brightness": 0.99,
            "saturation": 0.90,
            "sharpness": 1.20,
            "autocontrast_cutoff": 0.24,
            "unsharp_radius": 0.9,
            "unsharp_percent": 100,
            "unsharp_threshold": 1,
            "mask_feather": 12,
            "split_feather": 16,
            "min_clarity_delta": 0.0,
            "min_mean_delta": 0.0,
        },
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v196 smart studio/adaptive render: auto-detects center-stone left/right clarity imbalance and balances the lower-clarity side."
        recipe["render"]["samples"] = 840
        recipe["postprocess"]["center_stone_symmetry"] = variant["symmetry"]
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

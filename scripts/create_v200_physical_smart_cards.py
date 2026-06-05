from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v193a_front_depth_oval_band.json"


def card(name: str, position: list[float], rotation: list[float], size: list[float], gray: float) -> dict:
    return {
        "name": f"adaptive_reflection_card_{name}",
        "position": position,
        "rotation_degrees": rotation,
        "size": size,
        "color": [gray, gray, gray + 0.003, 1.0],
        "visible_to_camera": False,
        "visible_to_shadow": False,
        "visible_to_diffuse": False,
        "visible_to_glossy": True,
        "visible_to_transmission": True,
        "visible_to_volume_scatter": False,
    }


def lights(recipe: dict, front: float, fill: float, top: float, sparkle: float) -> None:
    for item in recipe["source_scene"]["light_adjustments"]:
        contains = item.get("contains", [])
        if "large_front_left_softbox" in contains:
            item["power_scale"] = front
        elif "weak_front_right_fill" in contains:
            item["power_scale"] = fill
        elif "low_top_softbox" in contains:
            item["power_scale"] = top
        elif "diamond_micro_sparkle" in contains:
            item["power_scale"] = sparkle


def symmetry(recipe: dict, strength: float, contrast: float, brightness: float, cutoff: float) -> None:
    recipe["postprocess"]["center_stone_symmetry"] = {
        "enabled": True,
        "object_contains": ["Diamond_Round_11"],
        "fallback_bounds_norm": [0.33, 0.22, 0.67, 0.58],
        "padding_px": 26,
        "target_side": "auto",
        "strength": strength,
        "max_strength": min(0.88, strength + 0.08),
        "adaptive_strength": True,
        "contrast": contrast,
        "brightness": brightness,
        "saturation": 0.88,
        "sharpness": 1.22,
        "autocontrast_cutoff": cutoff,
        "unsharp_radius": 0.9,
        "unsharp_percent": 105,
        "unsharp_threshold": 1,
        "mask_feather": 12,
        "split_feather": 16,
        "min_clarity_delta": 0.0,
        "min_mean_delta": 0.0,
    }


VARIANTS = [
    {
        "name": "v200a_physical_left_facet_break",
        "resolution": 620,
        "samples": 180,
        "exposure": -0.94,
        "lights": (0.84, 0.58, 0.52, 2.18),
        "cards": [
            card("left_dark_facet", [-1.75, -0.92, 1.55], [58, 0, -44], [1.25, 1.05], 0.015),
            card("right_soft_lift", [2.15, -1.15, 1.25], [64, 0, 50], [1.55, 1.0], 0.38),
            card("top_narrow_dark", [-0.10, -0.42, 2.42], [8, 0, -8], [1.8, 0.55], 0.025),
        ],
        "symmetry": (0.56, 1.30, 0.982, 0.30),
    },
    {
        "name": "v200b_physical_split_cards",
        "resolution": 620,
        "samples": 180,
        "exposure": -0.95,
        "lights": (0.80, 0.62, 0.50, 2.25),
        "cards": [
            card("left_deep_vertical", [-1.95, -1.00, 1.35], [66, 0, -54], [1.45, 1.15], 0.010),
            card("right_gray_vertical", [2.05, -1.05, 1.35], [66, 0, 54], [1.45, 1.15], 0.30),
            card("upper_table_split", [-0.15, -0.35, 2.55], [0, 0, -14], [2.25, 0.72], 0.018),
        ],
        "symmetry": (0.68, 1.38, 0.970, 0.36),
    },
    {
        "name": "v200c_physical_clean_bright_cards",
        "resolution": 620,
        "samples": 180,
        "exposure": -0.91,
        "lights": (0.94, 0.58, 0.62, 2.02),
        "cards": [
            card("left_mid_facet", [-1.65, -0.95, 1.45], [60, 0, -42], [1.20, 0.95], 0.045),
            card("right_white_lift", [2.20, -1.10, 1.30], [64, 0, 52], [1.55, 1.0], 0.55),
            card("top_gray_band", [0.05, -0.35, 2.50], [4, 0, 10], [2.0, 0.62], 0.10),
        ],
        "symmetry": (0.46, 1.22, 0.995, 0.22),
    },
    {
        "name": "v200d_physical_low_fill_dark_table",
        "resolution": 620,
        "samples": 180,
        "exposure": -0.98,
        "lights": (0.76, 0.54, 0.48, 2.36),
        "cards": [
            card("left_black_close", [-1.55, -0.78, 1.40], [55, 0, -36], [1.0, 0.95], 0.006),
            card("right_gray_close", [1.85, -0.95, 1.28], [60, 0, 44], [1.20, 0.95], 0.24),
            card("top_dark_table", [0.0, -0.28, 2.35], [0, 0, 0], [1.65, 0.50], 0.012),
        ],
        "symmetry": (0.76, 1.46, 0.955, 0.42),
    },
]


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = "v200 physical smart-studio preview: source-scene render cards added before render to change real diamond reflections."
        recipe["render"]["resolution"] = [variant["resolution"], variant["resolution"]]
        recipe["render"]["samples"] = variant["samples"]
        recipe["render"]["exposure"] = variant["exposure"]
        recipe["source_scene"]["metadata_exclude_contains"] = sorted(set(recipe["source_scene"].get("metadata_exclude_contains", []) + ["adaptive_reflection_card"]))
        recipe["source_scene"]["reflection_cards"] = variant["cards"]
        lights(recipe, *variant["lights"])
        symmetry(recipe, *variant["symmetry"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

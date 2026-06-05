from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
BASE_PATH = ROOT / "v180b_son2_center_dimond_shader.json"


PRODUCT_TOKENS = [
    "Diamond_Round",
    "Prong",
    "MASTER_SCENE_realistic_polished_gold",
    "Shiny Gold",
]


ANGLE_UPPER_LEFT = {
    "rotation_degrees": [0, 0, 34],
    "scale": 0.90,
    "translation": [-0.015, 0.0, 0.0],
}

ANGLE_LOW_FRONT = {
    "rotation_degrees": [-22, 0, -18],
    "scale": 0.90,
    "translation": [0.0, 0.0, -0.01],
}

ANGLE_RING_CIRCLE = {
    "rotation_degrees": [0, 0, -32],
    "scale": 0.88,
    "translation": [0.0, 0.0, -0.01],
}


def lights(front: float, fill: float, top: float, sparkle: float) -> list[dict]:
    return [
        {"contains": ["large_front_left_softbox"], "power_scale": front},
        {"contains": ["weak_front_right_fill"], "power_scale": fill},
        {"contains": ["low_top_softbox"], "power_scale": top},
        {
            "contains": ["diamond_micro_sparkle"],
            "power_scale": sparkle,
            "color": [0.94, 0.98, 1.0],
        },
    ]


def source_cards(dark: float, gray: float, inner: float | None = None) -> list[dict]:
    cards = [
        {
            "contains": ["NEWS_FINAL_diamond_dark_facet_card"],
            "source_material_adjust": {
                "base_color": [dark, dark, dark + 0.003, 1.0],
                "diffuse_color": [dark, dark, dark + 0.003, 1.0],
                "emission_color": [dark, dark, dark + 0.003, 1.0],
                "emission_strength_scale": 0.72,
            },
        },
        {
            "contains": ["MASTER_SCENE_soft_gray_side_reflection"],
            "source_material_adjust": {
                "base_color": [gray, gray, gray + 0.012, 1.0],
                "diffuse_color": [gray, gray, gray + 0.012, 1.0],
                "emission_color": [gray, gray, gray + 0.012, 1.0],
                "emission_strength_scale": 0.85,
            },
        },
    ]
    if inner is not None:
        cards.append(
            {
                "contains": ["MASTER_SCENE_dark_inner_reflection_low"],
                "source_material_adjust": {
                    "base_color": [inner, inner, inner + 0.002, 1.0],
                    "diffuse_color": [inner, inner, inner + 0.002, 1.0],
                    "emission_color": [inner, inner, inner + 0.002, 1.0],
                    "emission_strength_scale": 0.35,
                },
            }
        )
    return cards


VARIANTS = [
    {
        "name": "v187a_research_softbox_balance_upper_left",
        "angle": ANGLE_UPPER_LEFT,
        "description": "Research studio test: less broad wash, subtle gray side reflection, no aggressive lower black card.",
        "lights": lights(0.78, 0.54, 0.72, 1.68),
        "cards": source_cards(0.025, 0.27),
        "exposure": -0.82,
        "metal": {"roughness": 0.30, "base_color": [0.29, 0.305, 0.335, 1.0]},
        "stone": {"hsv_value_scale": 0.63, "hsv_value_max": 0.92, "saturation_scale": 0.82},
        "post": {"contrast": 1.46, "brightness": 0.94, "sharpness": 1.22, "blend": 0.48},
    },
    {
        "name": "v187b_research_facet_card_low_front",
        "angle": ANGLE_LOW_FRONT,
        "description": "Research studio test: lower camera angle with controlled dark facet card and restrained top wash.",
        "lights": lights(0.74, 0.50, 0.66, 1.92),
        "cards": source_cards(0.018, 0.24, inner=0.035),
        "exposure": -0.88,
        "metal": {"roughness": 0.32, "base_color": [0.285, 0.302, 0.335, 1.0]},
        "stone": {"hsv_value_scale": 0.60, "hsv_value_max": 0.90, "saturation_scale": 0.86},
        "post": {"contrast": 1.52, "brightness": 0.925, "sharpness": 1.26, "blend": 0.52},
    },
    {
        "name": "v187c_research_catalog_ring_circle",
        "angle": ANGLE_RING_CIRCLE,
        "description": "Research studio test: catalog front angle with stronger metal reflection bands but clean white floor.",
        "lights": lights(0.82, 0.46, 0.70, 1.72),
        "cards": source_cards(0.022, 0.20),
        "exposure": -0.84,
        "metal": {"roughness": 0.27, "base_color": [0.30, 0.318, 0.35, 1.0]},
        "stone": {"hsv_value_scale": 0.62, "hsv_value_max": 0.91, "saturation_scale": 0.84},
        "post": {"contrast": 1.50, "brightness": 0.93, "sharpness": 1.24, "blend": 0.50},
    },
]


def update_materials(recipe: dict, variant: dict) -> None:
    for material in recipe.get("material_map", []):
        contains = material.get("contains", [])
        adjust = material.setdefault("source_material_adjust", {})
        if any(token in contains for token in ["gold", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"]):
            base_color = variant["metal"]["base_color"]
            adjust["base_color"] = base_color
            adjust["diffuse_color"] = base_color
            adjust["roughness"] = variant["metal"]["roughness"]
            adjust["specular_ior_level"] = 0.44
        elif "Diamond_Round_11" in contains:
            adjust.update(variant["stone"])


def main() -> None:
    base = json.loads(BASE_PATH.read_text(encoding="utf-8-sig"))
    for variant in VARIANTS:
        recipe = copy.deepcopy(base)
        recipe["name"] = variant["name"]
        recipe["description"] = variant["description"]
        recipe["source_scene"].pop("use_recipe_camera", None)
        recipe["source_scene"]["light_adjustments"] = variant["lights"]
        recipe["source_scene"]["object_adjustments"] = variant["cards"]
        recipe["source_scene"]["group_adjustments"] = [
            {
                "contains": PRODUCT_TOKENS,
                "rotation_degrees": variant["angle"]["rotation_degrees"],
                "scale": variant["angle"]["scale"],
                "translation": variant["angle"]["translation"],
            }
        ]
        recipe["render"]["samples"] = 720
        recipe["render"]["exposure"] = variant["exposure"]
        update_materials(recipe, variant)
        center = recipe["postprocess"]["center_stone"]
        center["object_contains"] = ["Diamond_Round_11"]
        center["fallback_bounds_norm"] = [0.34, 0.18, 0.66, 0.52]
        center["padding_px"] = 28
        center.update(variant["post"])
        path = ROOT / f"{recipe['name']}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

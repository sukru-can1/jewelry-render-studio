from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path("outputs/ring99/recipes")
SOURCES = [
    ("v152a_side_metal_real_gray.json", "v153a_son2_blender5_real_gray"),
    ("v152b_side_metal_split_reflection.json", "v153b_son2_blender5_split_reflection"),
    ("v152e_side_metal_clean_platinum.json", "v153c_son2_blender5_clean_platinum"),
]


def main() -> None:
    for source_name, target_name in SOURCES:
        recipe = copy.deepcopy(json.loads((ROOT / source_name).read_text(encoding="utf-8-sig")))
        recipe["name"] = target_name
        recipe["description"] = (
            "son2.blend render on Blender 5 runtime. Side-metal environment pass with reduced white wash, "
            "darker gray/black reflectors, and unchanged product geometry."
        )
        recipe["render"]["samples"] = 300
        path = ROOT / f"{target_name}.json"
        path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()

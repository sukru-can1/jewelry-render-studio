import argparse
import copy
import itertools
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BLENDER_SCRIPT = ROOT / "scripts" / "blender_render.py"


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def set_path(data, dotted_path, value):
    parts = dotted_path.split(".")
    current = data
    for part in parts[:-1]:
        if isinstance(current, list):
            match = next((item for item in current if item.get("name") == part), None)
            if match is None:
                raise KeyError(f"No named item '{part}' in {dotted_path}")
            current = match
        else:
            current = current[part]
    last = parts[-1]
    if isinstance(current, list):
        match = next((item for item in current if item.get("name") == last), None)
        if match is None:
            raise KeyError(f"No named item '{last}' in {dotted_path}")
        raise ValueError(f"Path {dotted_path} points to an object, not a value")
    current[last] = value


def variants_from_recipe(recipe, limit=None):
    experiments = recipe.get("experiments", {})
    if not experiments:
        yield "baseline", recipe
        return

    keys = list(experiments.keys())
    values = [experiments[key] for key in keys]
    for index, combo in enumerate(itertools.product(*values), start=1):
        if limit and index > limit:
            break
        variant = copy.deepcopy(recipe)
        variant.pop("experiments", None)
        changes = {}
        for key, value in zip(keys, combo):
            set_path(variant, key, value)
            changes[key] = value
        variant["variant"] = {"index": index, "changes": changes}
        yield f"variant_{index:03d}", variant


def blender_command(blender, model, recipe_path, output_path, metadata_path):
    return [
        str(blender),
        "--background",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--model",
        str(model),
        "--recipe",
        str(recipe_path),
        "--output",
        str(output_path),
        "--metadata",
        str(metadata_path),
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to GLB/GLTF/OBJ/FBX/STL jewelry model")
    parser.add_argument("--recipe", required=True, help="Path to render recipe JSON")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--blender", default=os.environ.get("BLENDER_PATH", "blender"))
    parser.add_argument("--limit", type=int, default=None, help="Limit number of generated variants")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    model = Path(args.model).resolve()
    recipe_path = Path(args.recipe).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not model.exists():
        raise SystemExit(f"Model not found: {model}")

    recipe = load_json(recipe_path)
    manifest = []

    for name, variant in variants_from_recipe(recipe, args.limit):
        variant_dir = output_dir / name
        variant_recipe = variant_dir / "recipe.json"
        image_path = variant_dir / "render.png"
        metadata_path = variant_dir / "metadata.json"
        write_json(variant_recipe, variant)

        cmd = blender_command(args.blender, model, variant_recipe, image_path, metadata_path)
        manifest.append({"name": name, "image": str(image_path), "recipe": str(variant_recipe)})
        print(f"[render] {name}")
        if args.dry_run:
            print(" ".join(cmd))
            continue
        result = subprocess.run(cmd, cwd=str(ROOT), text=True)
        if result.returncode != 0:
            raise SystemExit(result.returncode)

    write_json(output_dir / "manifest.json", manifest)
    print(f"[done] wrote {output_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()


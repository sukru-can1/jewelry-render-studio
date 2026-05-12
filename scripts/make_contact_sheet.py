import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def find_images(input_dir):
    return sorted(Path(input_dir).glob("variant_*/render.png"))


def load_label(variant_dir):
    recipe_path = variant_dir / "recipe.json"
    if not recipe_path.exists():
        return variant_dir.name
    with open(recipe_path, "r", encoding="utf-8") as handle:
        recipe = json.load(handle)
    changes = recipe.get("variant", {}).get("changes", {})
    if not changes:
        return variant_dir.name
    parts = [variant_dir.name]
    for key, value in changes.items():
        parts.append(f"{key}={value}")
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--thumb-size", type=int, default=320)
    parser.add_argument("--columns", type=int, default=4)
    args = parser.parse_args()

    images = find_images(args.input)
    if not images:
        raise SystemExit(f"No render images found in {args.input}")

    thumb = args.thumb_size
    label_h = 92
    cols = args.columns
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb, rows * (thumb + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for idx, image_path in enumerate(images):
        col = idx % cols
        row = idx // cols
        x = col * thumb
        y = row * (thumb + label_h)
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        ox = x + (thumb - image.width) // 2
        oy = y + (thumb - image.height) // 2
        sheet.paste(image, (ox, oy))
        draw.text((x + 8, y + thumb + 8), load_label(image_path.parent), fill=(20, 20, 20), font=font)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)
    print(f"[done] wrote {output}")


if __name__ == "__main__":
    main()


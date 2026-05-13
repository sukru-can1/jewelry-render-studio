from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--recipe", required=True)
    return parser.parse_args()


def find_object_bounds(metadata, tokens):
    lowered = [token.lower() for token in tokens]
    matches = []
    for item in metadata.get("object_image_bounds", []):
        signature = str(item.get("signature", item.get("name", ""))).lower()
        if any(token in signature for token in lowered):
            bounds = item.get("bounds_px")
            if isinstance(bounds, list) and len(bounds) == 4:
                matches.append((item, [int(value) for value in bounds]))
    if not matches:
        return None
    matches.sort(key=lambda match: (match[1][2] - match[1][0]) * (match[1][3] - match[1][1]), reverse=True)
    return matches[0]


def clamp_box(box, width, height):
    x0, y0, x1, y1 = box
    return [max(0, x0), max(0, y0), min(width - 1, x1), min(height - 1, y1)]


def expanded_ellipse_box(bounds, width, height, scale):
    x0, y0, x1, y1 = bounds
    cx = (x0 + x1) * 0.5
    cy = (y0 + y1) * 0.5
    radius = max(x1 - x0, y1 - y0) * scale * 0.5
    return clamp_box([round(cx - radius), round(cy - radius), round(cx + radius), round(cy + radius)], width, height)


def add_star(draw, center, radius, color, alpha):
    cx, cy = center
    line_color = (*color, alpha)
    for angle in (0, math.pi / 2, math.pi / 4, -math.pi / 4):
        dx = math.cos(angle) * radius
        dy = math.sin(angle) * radius
        draw.line((cx - dx, cy - dy, cx + dx, cy + dy), fill=line_color, width=max(1, round(radius * 0.035)))


def add_facet_overlay(image, bounds, config):
    width, height = image.size
    x0, y0, x1, y1 = expanded_ellipse_box(bounds, width, height, float(config.get("radius_scale", 1.03)))
    if x1 <= x0 or y1 <= y0:
        return image, None

    diameter = min(x1 - x0, y1 - y0)
    cx = (x0 + x1) * 0.5
    cy = (y0 + y1) * 0.5
    radius = diameter * 0.5

    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((cx - radius, cy - radius * 0.88, cx + radius, cy + radius * 0.88), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, round(diameter * 0.018))))

    sharpened = image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=int(config.get("sharpen_percent", 175)), threshold=3))
    contrasted = ImageEnhance.Contrast(sharpened).enhance(float(config.get("contrast", 1.18)))
    image = Image.composite(contrasted, image, mask.point(lambda value: round(value * float(config.get("local_blend", 0.62)))))

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    facet_count = int(config.get("facets", 18))
    dark_alpha = int(config.get("dark_alpha", 22))
    light_alpha = int(config.get("light_alpha", 34))
    chroma_alpha = int(config.get("chroma_alpha", 26))

    for i in range(facet_count):
        a0 = -math.pi / 2 + i * math.tau / facet_count
        a1 = -math.pi / 2 + (i + 1) * math.tau / facet_count
        mid = (a0 + a1) * 0.5
        inner = radius * (0.12 if i % 2 else 0.24)
        p0 = (cx + math.cos(a0) * radius * 0.94, cy + math.sin(a0) * radius * 0.82)
        p1 = (cx + math.cos(a1) * radius * 0.94, cy + math.sin(a1) * radius * 0.82)
        pc = (cx + math.cos(mid) * inner, cy + math.sin(mid) * inner * 0.82)
        if i % 3 == 0:
            fill = (255, 255, 255, light_alpha)
        elif i % 3 == 1:
            fill = (26, 31, 38, dark_alpha)
        else:
            fill = (160, 206, 255, chroma_alpha) if i % 2 else (255, 226, 145, chroma_alpha)
        draw.polygon((pc, p0, p1), fill=fill)

    for i in range(facet_count):
        angle = -math.pi / 2 + i * math.tau / facet_count
        edge = (cx + math.cos(angle) * radius * 0.92, cy + math.sin(angle) * radius * 0.8)
        alpha = light_alpha if i % 2 == 0 else dark_alpha
        color = (255, 255, 255, alpha) if i % 2 == 0 else (18, 22, 28, alpha)
        draw.line((cx, cy, edge[0], edge[1]), fill=color, width=max(1, round(diameter * 0.004)))

    sparkle_strength = float(config.get("sparkle_strength", 1.0))
    sparkle_points = [
        (cx - radius * 0.38, cy - radius * 0.18, radius * 0.14),
        (cx + radius * 0.36, cy - radius * 0.28, radius * 0.11),
        (cx + radius * 0.08, cy + radius * 0.21, radius * 0.08),
    ]
    for sx, sy, sr in sparkle_points:
        add_star(draw, (sx, sy), sr * sparkle_strength, (255, 255, 255), int(82 * sparkle_strength))

    overlay_alpha = overlay.getchannel("A")
    overlay.putalpha(ImageChops.multiply(overlay_alpha, mask))
    image = Image.alpha_composite(image.convert("RGBA"), overlay)
    return image, [x0, y0, x1, y1]


def cleanup_catalog_image(image, config):
    image = ImageEnhance.Sharpness(image).enhance(float(config.get("sharpness", 1.08)))
    image = ImageEnhance.Contrast(image).enhance(float(config.get("contrast", 1.03)))
    image = ImageEnhance.Brightness(image).enhance(float(config.get("brightness", 1.01)))
    return image


def main():
    parsed = args()
    recipe = json.loads(Path(parsed.recipe).read_text(encoding="utf-8"))
    metadata_path = Path(parsed.metadata)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    config = recipe.get("postprocess", {})
    if not config.get("enabled", False):
        return

    image_path = Path(parsed.image)
    image = Image.open(image_path).convert("RGBA")
    image = cleanup_catalog_image(image, config.get("global", {}))

    center_config = config.get("center_diamond", {})
    applied_bounds = None
    if center_config.get("enabled", True):
        tokens = center_config.get("object_contains", ["Round_5"])
        match = find_object_bounds(metadata, tokens)
        if match:
            _, bounds = match
            image, applied_bounds = add_facet_overlay(image, bounds, center_config)

    image.save(image_path)
    metadata["postprocess"] = {"enabled": True, "center_bounds_px": applied_bounds}
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

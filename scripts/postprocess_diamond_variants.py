from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ellipse_mask(size: tuple[int, int], feather: float) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    inset_x = int(width * 0.035)
    inset_y = int(height * 0.035)
    draw.ellipse((inset_x, inset_y, width - inset_x, height - inset_y), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def star_facets(size: tuple[int, int], strength: float, fire: float) -> Image.Image:
    width, height = size
    cx = width * 0.5
    cy = height * 0.50
    rx = width * 0.44
    ry = height * 0.42
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    count = 24
    start = -math.pi / 2
    dark = int(255 * clamp(strength, 0.0, 1.0))
    light = int(255 * clamp(strength * 0.72, 0.0, 1.0))
    fire_alpha = int(255 * clamp(fire, 0.0, 1.0))
    colors = [
        (18, 20, 24, dark),
        (255, 255, 255, light),
        (64, 68, 74, int(dark * 0.62)),
        (255, 255, 255, int(light * 0.76)),
        (105, 176, 255, fire_alpha),
        (255, 196, 72, fire_alpha),
    ]

    for index in range(count):
        a0 = start + index * math.tau / count
        a1 = start + (index + 1) * math.tau / count
        mid = (a0 + a1) * 0.5
        inner = 0.19 if index % 2 else 0.31
        p0 = (cx + math.cos(a0) * rx, cy + math.sin(a0) * ry)
        p1 = (cx + math.cos(a1) * rx, cy + math.sin(a1) * ry)
        pc = (cx + math.cos(mid) * rx * inner, cy + math.sin(mid) * ry * inner)
        draw.polygon([pc, p0, p1], fill=colors[index % len(colors)])

    for index in range(0, count, 2):
        angle = start + index * math.tau / count
        draw.line(
            [
                (cx + math.cos(angle) * rx * 0.18, cy + math.sin(angle) * ry * 0.18),
                (cx + math.cos(angle) * rx * 0.96, cy + math.sin(angle) * ry * 0.96),
            ],
            fill=(20, 22, 26, int(dark * 0.42)),
            width=max(1, int(min(width, height) * 0.004)),
        )

    return overlay


def add_fire_points(crop: Image.Image, mask: Image.Image, amount: float) -> Image.Image:
    overlay = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    width, height = crop.size
    points = [
        (0.28, 0.30, (95, 180, 255)),
        (0.74, 0.36, (255, 192, 68)),
        (0.23, 0.63, (255, 150, 170)),
        (0.78, 0.66, (90, 180, 255)),
        (0.49, 0.22, (255, 255, 255)),
    ]
    alpha = int(255 * clamp(amount, 0.0, 1.0))
    for x_norm, y_norm, color in points:
        x = x_norm * width
        y = y_norm * height
        r = max(2, int(min(width, height) * 0.026))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(*color, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(max(1, int(min(width, height) * 0.012))))
    overlay.putalpha(Image.composite(overlay.getchannel("A"), Image.new("L", crop.size, 0), mask))
    result = crop.copy()
    result.alpha_composite(overlay)
    return result


def edit_diamond(image: Image.Image, bounds: tuple[int, int, int, int], strength: float, fire: float, contrast: float) -> Image.Image:
    original = image.convert("RGBA")
    crop = original.crop(bounds).convert("RGBA")
    mask = ellipse_mask(crop.size, 7)

    rgb = crop.convert("RGB")
    rgb = ImageOps.autocontrast(rgb, cutoff=0.2)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    rgb = ImageEnhance.Brightness(rgb).enhance(0.985)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.12)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.8, percent=115, threshold=2))

    enhanced = Image.blend(crop, rgb.convert("RGBA"), 0.35)
    facets = star_facets(crop.size, strength, fire * 0.55)
    facets.putalpha(Image.composite(facets.getchannel("A"), Image.new("L", crop.size, 0), mask))
    enhanced.alpha_composite(facets)
    enhanced = add_fire_points(enhanced, mask, fire)

    result = original.copy()
    result.paste(enhanced, bounds, mask)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    width, height = source.size
    bounds = (
        int(width * 0.365),
        int(height * 0.555),
        int(width * 0.635),
        int(height * 0.825),
    )

    variants = {
        "v136a_post_diamond_natural": (0.13, 0.10, 1.16),
        "v136b_post_diamond_crisp": (0.18, 0.13, 1.20),
        "v136c_post_diamond_fire": (0.16, 0.20, 1.18),
        "v136d_post_diamond_bold": (0.24, 0.16, 1.24),
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, (strength, fire, contrast) in variants.items():
        edited = edit_diamond(source, bounds, strength, fire, contrast)
        edited.save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

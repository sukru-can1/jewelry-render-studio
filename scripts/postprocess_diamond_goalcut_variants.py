from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def circle_mask(size: tuple[int, int], radius_scale: float, feather: float) -> Image.Image:
    width, height = size
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * radius_scale
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def ring_mask(size: tuple[int, int], inner: float, outer: float, feather: float) -> Image.Image:
    outer_mask = circle_mask(size, outer, 0)
    inner_mask = circle_mask(size, inner, 0)
    mask = ImageChops.subtract(outer_mask, inner_mask)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def p(cx: float, cy: float, radius: float, angle: float) -> tuple[float, float]:
    return cx + math.cos(angle) * radius, cy + math.sin(angle) * radius


def dehaze_crop(crop: Image.Image, amount: float) -> Image.Image:
    rgb = crop.convert("RGB")
    gray = rgb.convert("L")
    local = gray.filter(ImageFilter.GaussianBlur(4.5))
    dark_detail = ImageOps.autocontrast(ImageChops.subtract(local, gray, scale=2.8, offset=0), cutoff=0.7)
    light_detail = ImageOps.autocontrast(ImageChops.subtract(gray, local, scale=2.0, offset=0), cutoff=0.7)

    burned = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.28 * amount)
    dodged = ImageEnhance.Brightness(rgb).enhance(1.0 + 0.10 * amount)
    result = Image.composite(burned, rgb, dark_detail.filter(ImageFilter.GaussianBlur(0.6)))
    result = Image.composite(dodged, result, light_detail.filter(ImageFilter.GaussianBlur(0.5)))
    result = ImageEnhance.Contrast(result).enhance(1.0 + 0.36 * amount)
    result = ImageEnhance.Sharpness(result).enhance(1.0 + 0.95 * amount)
    return result.filter(ImageFilter.UnsharpMask(radius=0.45, percent=int(120 + 120 * amount), threshold=1)).convert("RGBA")


def goalcut_overlay(size: tuple[int, int], dark: float, fire: float) -> Image.Image:
    width, height = size
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * 0.424
    table_r = radius * 0.36
    crown_r = radius * 0.67
    outer_r = radius * 0.96
    base = -math.pi / 2
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    # Dark "arrows" in a photographed round brilliant, with uneven strengths.
    strengths = [0.84, 0.28, 0.72, 0.34, 0.62, 0.30, 0.78, 0.40]
    for i, strength in enumerate(strengths):
        a = base + (i + 0.5) * math.tau / 8
        spread = math.tau / 54
        points = [
            p(cx, cy, table_r * 0.20, a),
            p(cx, cy, table_r * 0.96, a - spread),
            p(cx, cy, crown_r * 0.96, a),
            p(cx, cy, table_r * 0.96, a + spread),
        ]
        draw.polygon(points, fill=(18, 22, 28, int(118 * dark * strength)))

    # White kite facets and darker crown triangles around the table.
    for i in range(16):
        a0 = base + i * math.tau / 16
        a1 = base + (i + 1) * math.tau / 16
        am = (a0 + a1) / 2
        if i % 4 == 0:
            color = (20, 24, 30, int(96 * dark))
        elif i % 4 == 2:
            color = (86, 96, 110, int(54 * dark))
        else:
            color = (255, 255, 255, int(66 * dark))
        draw.polygon(
            [
                p(cx, cy, table_r * 0.92, am),
                p(cx, cy, crown_r, a0),
                p(cx, cy, outer_r, am),
                p(cx, cy, crown_r, a1),
            ],
            fill=color,
        )

    # Small sharp shards break up the milky center without changing the stone outline.
    shard_sets = [
        [(0.46, 0.35), (0.53, 0.44), (0.43, 0.49), (34, 40, 50, 88)],
        [(0.57, 0.36), (0.64, 0.50), (0.51, 0.47), (232, 238, 246, 74)],
        [(0.38, 0.57), (0.49, 0.52), (0.46, 0.67), (44, 50, 60, 70)],
        [(0.62, 0.58), (0.50, 0.53), (0.55, 0.70), (238, 242, 248, 74)],
        [(0.48, 0.48), (0.56, 0.51), (0.50, 0.58), (18, 22, 28, 48)],
    ]
    for shard in shard_sets:
        points = [(x * width, y * height) for x, y in shard[:3]]
        r, g, b, a = shard[3]
        draw.polygon(points, fill=(r, g, b, int(a * dark)))

    # Crisp table edges.
    table_points = [p(cx, cy, table_r * 1.02, base + math.tau / 16 + i * math.tau / 8) for i in range(8)]
    draw.line(table_points + [table_points[0]], fill=(255, 255, 255, int(118 * dark)), width=max(1, int(radius * 0.010)))

    flashes = [
        (0.25, 0.31, (68, 180, 255), 0.013),
        (0.76, 0.37, (255, 202, 86), 0.013),
        (0.28, 0.69, (255, 126, 166), 0.011),
        (0.70, 0.73, (82, 184, 255), 0.011),
    ]
    for x, y, color, scale in flashes:
        rr = min(width, height) * scale
        fx = width * x
        fy = height * y
        draw.ellipse((fx - rr, fy - rr, fx + rr, fy + rr), fill=(*color, int(160 * fire)))

    return overlay.filter(ImageFilter.GaussianBlur(0.45))


def edit(source: Image.Image, bounds: tuple[int, int, int, int], dehaze: float, dark: float, fire: float) -> Image.Image:
    base = source.convert("RGBA")
    crop = base.crop(bounds).convert("RGBA")
    mask = circle_mask(crop.size, 0.428, 4.5)
    hard_mask = circle_mask(crop.size, 0.424, 0.8)
    edge_preserve = ring_mask(crop.size, 0.392, 0.452, 2.0)

    enhanced = dehaze_crop(crop, dehaze)
    overlay = goalcut_overlay(crop.size, dark, fire)
    overlay.putalpha(ImageChops.multiply(overlay.getchannel("A"), hard_mask))
    enhanced.alpha_composite(overlay)

    # Blend back a little of the original outer stone rim so the prong setting remains real.
    enhanced = Image.composite(crop, enhanced, edge_preserve)
    result = base.copy()
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
        int(width * 0.383),
        int(height * 0.579),
        int(width * 0.617),
        int(height * 0.813),
    )
    variants = {
        "v141a_goalcut_balanced": (0.72, 0.64, 0.26),
        "v141b_goalcut_crisp": (0.86, 0.78, 0.28),
        "v141c_goalcut_dark": (0.92, 0.94, 0.24),
        "v141d_goalcut_fire": (0.82, 0.74, 0.42),
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edit(source, bounds, *params).save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

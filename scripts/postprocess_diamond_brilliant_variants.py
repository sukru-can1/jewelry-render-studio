from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def multiply_mask(mask_a: Image.Image, mask_b: Image.Image) -> Image.Image:
    return ImageChops.multiply(mask_a.convert("L"), mask_b.convert("L"))


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


def polar_point(cx: float, cy: float, radius: float, angle: float) -> tuple[float, float]:
    return cx + math.cos(angle) * radius, cy + math.sin(angle) * radius


def brilliant_overlay(size: tuple[int, int], strength: float, fire: float) -> Image.Image:
    width, height = size
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * 0.445
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    table_r = radius * 0.36
    mid_r = radius * 0.66
    outer_r = radius * 0.97
    base = -math.pi / 2

    # Crown/table facets: alternating short triangular cuts, kept subtle and clipped later.
    for i in range(16):
        a0 = base + i * math.tau / 16
        a1 = base + (i + 1) * math.tau / 16
        am = (a0 + a1) / 2
        tone = (i % 4)
        if tone in (0, 3):
            color = (28, 34, 42, int(58 * strength))
        elif tone == 1:
            color = (245, 248, 252, int(42 * strength))
        else:
            color = (126, 142, 160, int(36 * strength))
        points = [
            polar_point(cx, cy, table_r, am),
            polar_point(cx, cy, mid_r, a0),
            polar_point(cx, cy, outer_r, am),
            polar_point(cx, cy, mid_r, a1),
        ]
        draw.polygon(points, fill=color)

    # Distinct arrow-like pavilion reflections, similar to a photographed diamond.
    for i in range(8):
        am = base + (i + 0.5) * math.tau / 8
        spread = math.tau / 72
        dark = i in (0, 2, 5, 7)
        alpha = int((82 if dark else 46) * strength)
        color = (20, 24, 30, alpha) if dark else (230, 236, 244, alpha)
        points = [
            polar_point(cx, cy, table_r * 0.34, am),
            polar_point(cx, cy, table_r * 1.08, am - spread),
            polar_point(cx, cy, outer_r * 0.86, am),
            polar_point(cx, cy, table_r * 1.08, am + spread),
        ]
        draw.polygon(points, fill=color)

    # Table: keep it glassy rather than opaque.
    table = [polar_point(cx, cy, table_r * 1.1, base + i * math.tau / 8 + math.tau / 16) for i in range(8)]
    draw.polygon(table, fill=(248, 250, 252, int(36 * strength)))
    for i in range(8):
        a = base + i * math.tau / 8
        draw.line(
            [polar_point(cx, cy, table_r * 0.52, a), polar_point(cx, cy, outer_r * 0.93, a)],
            fill=(255, 255, 255, int(42 * strength)),
            width=max(1, int(radius * 0.012)),
        )

    # A few small dispersion flashes, low alpha so it reads like fire instead of paint.
    flashes = [
        (0.31, 0.28, (80, 176, 255), 0.020),
        (0.69, 0.33, (255, 204, 92), 0.018),
        (0.27, 0.64, (255, 126, 170), 0.016),
        (0.73, 0.67, (86, 184, 255), 0.016),
        (0.54, 0.77, (255, 225, 116), 0.014),
    ]
    for x, y, color, rscale in flashes:
        r = min(width, height) * rscale
        fx = width * x
        fy = height * y
        draw.ellipse((fx - r, fy - r, fx + r, fy + r), fill=(*color, int(92 * fire)))

    return overlay.filter(ImageFilter.GaussianBlur(max(1, int(radius * 0.012))))


def enhance_existing_texture(crop: Image.Image, amount: float) -> Image.Image:
    rgb = crop.convert("RGB")
    gray = rgb.convert("L")
    local = gray.filter(ImageFilter.GaussianBlur(5.5))
    detail = ImageChops.subtract(gray, local, scale=1.9, offset=128)
    detail = ImageOps.autocontrast(detail, cutoff=0.3)

    darker = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.20 * amount)
    lighter = ImageEnhance.Brightness(rgb).enhance(1.0 + 0.12 * amount)
    dark_mask = ImageOps.autocontrast(ImageChops.subtract(local, gray, scale=2.6, offset=0), cutoff=1.0)
    light_mask = ImageOps.autocontrast(ImageChops.subtract(gray, local, scale=2.0, offset=0), cutoff=1.0)
    result = Image.composite(darker, rgb, dark_mask.filter(ImageFilter.GaussianBlur(0.8)))
    result = Image.composite(lighter, result, light_mask.filter(ImageFilter.GaussianBlur(0.8)))
    result = ImageEnhance.Contrast(result).enhance(1.0 + 0.24 * amount)
    result = ImageEnhance.Sharpness(result).enhance(1.0 + 0.65 * amount)
    result = result.filter(ImageFilter.UnsharpMask(radius=0.55, percent=int(95 + 95 * amount), threshold=1))
    detail_rgb = Image.merge("RGB", (detail, detail, detail))
    result = Image.blend(result, detail_rgb, 0.08 + 0.07 * amount)
    return result.convert("RGBA")


def edit(
    source: Image.Image,
    bounds: tuple[int, int, int, int],
    texture: float,
    facet: float,
    fire: float,
    radius_scale: float,
) -> Image.Image:
    original = source.convert("RGBA")
    crop = original.crop(bounds).convert("RGBA")
    mask = circle_mask(crop.size, radius_scale, 5.5)
    hard_mask = circle_mask(crop.size, radius_scale * 0.985, 1.2)

    enhanced = enhance_existing_texture(crop, texture)
    overlay = brilliant_overlay(crop.size, facet, fire)
    overlay.putalpha(multiply_mask(overlay.getchannel("A"), hard_mask))
    enhanced.alpha_composite(overlay)

    # Preserve the existing rendered girdle and prongs by fading the outer edge.
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
        int(width * 0.383),
        int(height * 0.579),
        int(width * 0.617),
        int(height * 0.813),
    )
    variants = {
        "v139a_brilliant_subtle": (0.74, 0.54, 0.36, 0.445),
        "v139b_brilliant_crisp": (0.86, 0.72, 0.44, 0.445),
        "v139c_brilliant_dark_arrows": (0.92, 0.88, 0.38, 0.438),
        "v139d_brilliant_clean_fire": (0.82, 0.64, 0.62, 0.445),
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edit(source, bounds, *params).save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

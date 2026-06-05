from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ellipse_mask(size: tuple[int, int], feather: float, inset: float = 0.04) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    ix = int(width * inset)
    iy = int(height * inset)
    draw.ellipse((ix, iy, width - ix, height - iy), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def luminance_detail_boost(crop: Image.Image, amount: float) -> Image.Image:
    rgb = crop.convert("RGB")
    gray = rgb.convert("L")
    blur = gray.filter(ImageFilter.GaussianBlur(7))
    high = ImageChops.subtract(gray, blur, scale=1.35, offset=128)
    high = ImageOps.autocontrast(high, cutoff=0.3)
    detail = Image.merge("RGB", (high, high, high))
    boosted = Image.blend(rgb, detail, clamp(amount, 0.0, 1.0))
    boosted = ImageEnhance.Contrast(boosted).enhance(1.10)
    boosted = boosted.filter(ImageFilter.UnsharpMask(radius=0.8, percent=95, threshold=2))
    return boosted.convert("RGBA")


def polygon_layer(size: tuple[int, int], variant: str, dark: float, light: float, fire: float) -> Image.Image:
    width, height = size
    def p(x: float, y: float) -> tuple[float, float]:
        return (x * width, y * height)

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    da = int(255 * dark)
    la = int(255 * light)
    fa = int(255 * fire)

    dark_color = (18, 21, 26, da)
    soft_dark = (55, 60, 68, int(da * 0.62))
    white = (255, 255, 255, la)
    cool = (95, 172, 255, fa)
    warm = (255, 195, 75, fa)

    polygons = [
        ([p(0.46, 0.13), p(0.54, 0.13), p(0.52, 0.36), p(0.48, 0.36)], dark_color),
        ([p(0.32, 0.23), p(0.45, 0.15), p(0.46, 0.42), p(0.38, 0.50)], soft_dark),
        ([p(0.68, 0.23), p(0.55, 0.15), p(0.54, 0.42), p(0.62, 0.50)], soft_dark),
        ([p(0.24, 0.45), p(0.39, 0.50), p(0.31, 0.63)], dark_color),
        ([p(0.76, 0.45), p(0.61, 0.50), p(0.69, 0.63)], dark_color),
        ([p(0.42, 0.44), p(0.58, 0.44), p(0.52, 0.58), p(0.48, 0.58)], white),
        ([p(0.36, 0.68), p(0.48, 0.58), p(0.46, 0.82)], soft_dark),
        ([p(0.64, 0.68), p(0.52, 0.58), p(0.54, 0.82)], soft_dark),
    ]

    if variant in {"crisp", "bold"}:
        polygons.extend(
            [
                ([p(0.18, 0.35), p(0.32, 0.28), p(0.28, 0.49)], (25, 28, 34, int(da * 0.74))),
                ([p(0.82, 0.35), p(0.68, 0.28), p(0.72, 0.49)], (25, 28, 34, int(da * 0.74))),
                ([p(0.50, 0.30), p(0.58, 0.45), p(0.50, 0.52), p(0.42, 0.45)], (255, 255, 255, int(la * 0.65))),
            ]
        )
    if variant == "bold":
        polygons.extend(
            [
                ([p(0.42, 0.16), p(0.46, 0.43), p(0.39, 0.37)], (6, 8, 12, int(da * 0.92))),
                ([p(0.58, 0.16), p(0.54, 0.43), p(0.61, 0.37)], (6, 8, 12, int(da * 0.92))),
            ]
        )

    for points, color in polygons:
        draw.polygon(points, fill=color)

    line_alpha = int(255 * dark * 0.42)
    for angle in [20, 48, 82, 118, 151, 205, 244, 289, 330]:
        rad = math.radians(angle)
        cx, cy = p(0.5, 0.52)
        ex = cx + math.cos(rad) * width * 0.42
        ey = cy + math.sin(rad) * height * 0.40
        draw.line((cx, cy, ex, ey), fill=(24, 28, 34, line_alpha), width=max(1, int(width * 0.0035)))

    for x, y, color, radius in [
        (0.29, 0.30, cool, 0.025),
        (0.72, 0.33, warm, 0.024),
        (0.23, 0.62, warm, 0.020),
        (0.77, 0.64, cool, 0.020),
        (0.50, 0.23, white, 0.018),
    ]:
        cx, cy = p(x, y)
        r = min(width, height) * radius
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

    return layer.filter(ImageFilter.GaussianBlur(max(1, int(min(width, height) * 0.004))))


def edit(image: Image.Image, bounds: tuple[int, int, int, int], variant: str, dark: float, light: float, fire: float, detail: float) -> Image.Image:
    original = image.convert("RGBA")
    crop = original.crop(bounds).convert("RGBA")
    mask = ellipse_mask(crop.size, 6, 0.055)

    enhanced = luminance_detail_boost(crop, detail)
    enhanced = Image.blend(crop, enhanced, 0.48)

    layer = polygon_layer(crop.size, variant, dark, light, fire)
    layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", crop.size, 0), mask))
    enhanced.alpha_composite(layer)

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
        "v137a_post_diamond_natural_irregular": ("natural", 0.13, 0.11, 0.10, 0.18),
        "v137b_post_diamond_crisp_irregular": ("crisp", 0.18, 0.13, 0.12, 0.20),
        "v137c_post_diamond_fire_irregular": ("crisp", 0.16, 0.14, 0.20, 0.18),
        "v137d_post_diamond_bold_irregular": ("bold", 0.23, 0.14, 0.15, 0.22),
        "v137e_post_diamond_crisp_clean": ("crisp", 0.16, 0.15, 0.10, 0.26),
        "v137f_post_diamond_catalog": ("natural", 0.15, 0.16, 0.08, 0.28),
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edited = edit(source, bounds, *params)
        edited.save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

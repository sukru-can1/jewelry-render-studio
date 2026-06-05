from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def luma_mask(image: Image.Image, low: int, high: int, blur: float = 0.0) -> Image.Image:
    gray = image.convert("L")
    low_img = Image.new("L", gray.size, low)
    high_img = Image.new("L", gray.size, high)
    mask = ImageChops.subtract(gray, low_img)
    mask = ImageChops.multiply(mask, ImageOps.invert(ImageChops.subtract(gray, high_img)))
    mask = ImageOps.autocontrast(mask)
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    return mask


def product_mask(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    r, g, b = rgb.split()
    gray = rgb.convert("L")
    not_white = ImageOps.invert(ImageOps.posterize(gray, 5))
    chroma = ImageChops.add(ImageChops.difference(r, g), ImageChops.difference(b, g), scale=1.0)
    mask = ImageChops.lighter(not_white, ImageOps.autocontrast(chroma))
    mask = ImageOps.autocontrast(mask, cutoff=0.4)
    mask = mask.filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(6))
    return mask


def add_floor_shadow(image: Image.Image, amount: float) -> Image.Image:
    width, height = image.size
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    # Main soft contact shadow and subtle reflection-shadow under the setting.
    shadows = [
        (0.50, 0.805, 0.58, 0.095, 72),
        (0.50, 0.842, 0.34, 0.052, 42),
        (0.30, 0.792, 0.21, 0.048, 28),
        (0.70, 0.792, 0.21, 0.048, 28),
    ]
    for cx, cy, rx, ry, alpha in shadows:
        draw.ellipse(
            (
                width * (cx - rx),
                height * (cy - ry),
                width * (cx + rx),
                height * (cy + ry),
            ),
            fill=(42, 45, 48, int(alpha * amount)),
        )
    overlay = overlay.filter(ImageFilter.GaussianBlur(int(height * 0.032)))
    keep_off_product = ImageOps.invert(product_mask(image).filter(ImageFilter.MaxFilter(9)))
    overlay.putalpha(ImageChops.multiply(overlay.getchannel("A"), keep_off_product))
    result = image.copy().convert("RGBA")
    result.alpha_composite(overlay)
    return result


def grade_background(image: Image.Image, amount: float) -> Image.Image:
    width, height = image.size
    bg = Image.new("RGBA", image.size, (255, 255, 255, 0))
    pix = bg.load()
    for y in range(height):
        yy = y / max(1, height - 1)
        floor = max(0.0, yy - 0.54) / 0.46
        shade = int((10 * floor + 7 * yy) * amount)
        for x in range(width):
            xx = (x / max(1, width - 1)) - 0.5
            vignette = int((abs(xx) ** 1.7) * 18 * amount)
            a = min(42, shade + vignette)
            pix[x, y] = (210, 214, 218, a)
    bg = bg.filter(ImageFilter.GaussianBlur(18))
    bg.putalpha(ImageChops.multiply(bg.getchannel("A"), ImageOps.invert(product_mask(image))))
    result = image.copy().convert("RGBA")
    result.alpha_composite(bg)
    return result


def grade_metal(image: Image.Image, amount: float) -> Image.Image:
    rgb = image.convert("RGB")
    mask = product_mask(image)
    mid_dark = luma_mask(rgb, 62, 222, 2.0)
    darkened = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.13 * amount)
    contrast = ImageEnhance.Contrast(darkened).enhance(1.0 + 0.24 * amount)
    sharp = ImageEnhance.Sharpness(contrast).enhance(1.0 + 0.22 * amount)
    metal_mask = ImageChops.multiply(mask, mid_dark)
    result = Image.composite(sharp, rgb, metal_mask)
    # A small global contrast lift keeps the high-key studio look without bleaching the metal.
    result = ImageEnhance.Contrast(result).enhance(1.0 + 0.05 * amount)
    return result.convert("RGBA")


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


def polar(cx: float, cy: float, radius: float, angle: float) -> tuple[float, float]:
    return cx + math.cos(angle) * radius, cy + math.sin(angle) * radius


def diamond_pass(crop: Image.Image, dark_amount: float, clarity: float, fire: float) -> Image.Image:
    rgb = crop.convert("RGB")
    gray = rgb.convert("L")
    local = gray.filter(ImageFilter.GaussianBlur(3.2))
    dark_detail = ImageOps.autocontrast(ImageChops.subtract(local, gray, scale=3.0, offset=0), cutoff=0.4)
    light_detail = ImageOps.autocontrast(ImageChops.subtract(gray, local, scale=2.3, offset=0), cutoff=0.4)

    burned = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.24 * clarity)
    dodged = ImageEnhance.Brightness(rgb).enhance(1.0 + 0.10 * clarity)
    result = Image.composite(burned, rgb, dark_detail.filter(ImageFilter.GaussianBlur(0.45)))
    result = Image.composite(dodged, result, light_detail.filter(ImageFilter.GaussianBlur(0.35)))
    result = ImageEnhance.Contrast(result).enhance(1.0 + 0.34 * clarity)
    result = result.filter(ImageFilter.UnsharpMask(radius=0.38, percent=int(130 + 110 * clarity), threshold=1)).convert("RGBA")

    width, height = crop.size
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * 0.423
    table = radius * 0.34
    crown = radius * 0.70
    outer = radius * 0.96
    overlay = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    base = -math.pi / 2 + 0.08

    # Photographic-looking uneven cuts. The asymmetry avoids a computer-generated mandala look.
    dark_facets = [
        (0.00, 0.92, 0.020),
        (0.13, 0.48, 0.016),
        (0.26, 0.78, 0.020),
        (0.41, 0.38, 0.014),
        (0.55, 0.66, 0.018),
        (0.73, 0.86, 0.021),
        (0.88, 0.52, 0.016),
    ]
    for turn, strength, spread in dark_facets:
        a = base + turn * math.tau
        draw.polygon(
            [
                polar(cx, cy, table * 0.25, a),
                polar(cx, cy, table * 1.10, a - math.tau * spread),
                polar(cx, cy, crown, a + math.tau * 0.005),
                polar(cx, cy, table * 1.04, a + math.tau * spread),
            ],
            fill=(16, 19, 25, int(120 * dark_amount * strength)),
        )

    for i in range(18):
        a0 = base + i * math.tau / 18
        a1 = base + (i + 1) * math.tau / 18
        am = (a0 + a1) / 2
        color = (255, 255, 255, int(46 * clarity)) if i % 3 else (56, 64, 76, int(50 * dark_amount))
        draw.polygon(
            [polar(cx, cy, table, am), polar(cx, cy, crown, a0), polar(cx, cy, outer, am), polar(cx, cy, crown, a1)],
            fill=color,
        )

    for x, y, color in [
        (0.24, 0.31, (60, 174, 255)),
        (0.75, 0.35, (255, 201, 82)),
        (0.29, 0.68, (255, 122, 166)),
        (0.70, 0.72, (76, 184, 255)),
        (0.50, 0.22, (255, 255, 255)),
    ]:
        rr = min(width, height) * 0.011
        draw.ellipse((width * x - rr, height * y - rr, width * x + rr, height * y + rr), fill=(*color, int(135 * fire)))

    overlay = overlay.filter(ImageFilter.GaussianBlur(0.35))
    overlay.putalpha(ImageChops.multiply(overlay.getchannel("A"), circle_mask(crop.size, 0.423, 0.8)))
    result.alpha_composite(overlay)
    return result


def edit(source: Image.Image, shadow: float, metal: float, clarity: float, dark: float, fire: float) -> Image.Image:
    image = source.convert("RGBA")
    image = grade_background(image, shadow * 0.70)
    image = add_floor_shadow(image, shadow)
    image = grade_metal(image, metal)

    width, height = image.size
    bounds = (
        int(width * 0.383),
        int(height * 0.579),
        int(width * 0.617),
        int(height * 0.813),
    )
    crop = image.crop(bounds)
    stone = diamond_pass(crop, dark, clarity, fire)
    mask = circle_mask(crop.size, 0.431, 4.2)
    image.paste(stone, bounds, mask)
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    variants = {
        "v142a_photo_grade_balanced": (0.88, 0.72, 0.70, 0.64, 0.28),
        "v142b_photo_grade_crisp": (1.00, 0.82, 0.84, 0.76, 0.30),
        "v142c_photo_grade_deeper": (1.12, 0.94, 0.90, 0.90, 0.26),
        "v142d_photo_grade_clean_fire": (0.96, 0.76, 0.78, 0.68, 0.42),
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edit(source, *params).save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

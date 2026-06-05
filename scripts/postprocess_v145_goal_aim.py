from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


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


def product_mask(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    gray = rgb.convert("L")
    not_white = ImageOps.invert(ImageOps.posterize(gray, 5))
    r, g, b = rgb.split()
    chroma = ImageChops.add(ImageChops.difference(r, g), ImageChops.difference(b, g))
    mask = ImageChops.lighter(not_white, ImageOps.autocontrast(chroma))
    mask = ImageOps.autocontrast(mask, cutoff=0.6)
    return mask.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(5))


def screen_blend(base: Image.Image, top: Image.Image, amount: float) -> Image.Image:
    inv_base = ImageOps.invert(base.convert("RGB"))
    inv_top = ImageOps.invert(top.convert("RGB"))
    screened = ImageOps.invert(ImageChops.multiply(inv_base, inv_top))
    return Image.blend(base.convert("RGB"), screened, amount)


def multiply_blend(base: Image.Image, top: Image.Image, amount: float) -> Image.Image:
    multiplied = ImageChops.multiply(base.convert("RGB"), top.convert("RGB"))
    return Image.blend(base.convert("RGB"), multiplied, amount)


def studio_grade(image: Image.Image, floor: float, shadow: float, metal_soften: float, tone: float) -> Image.Image:
    base = image.convert("RGBA")
    width, height = base.size

    # Soft gray studio falloff, drawn on a small buffer to avoid slow per-pixel full-res loops.
    small = Image.new("RGBA", (300, 300), (255, 255, 255, 0))
    draw = ImageDraw.Draw(small, "RGBA")
    draw.rectangle((0, 0, 300, 300), fill=(205, 209, 214, int(13 * floor)))
    draw.ellipse((-55, 112, 355, 370), fill=(184, 188, 193, int(24 * floor)))
    draw.ellipse((20, 148, 280, 258), fill=(150, 154, 160, int(20 * floor)))
    draw.ellipse((70, 150, 230, 215), fill=(255, 255, 255, int(22 * floor)))
    bg = small.resize((width, height), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(28))
    bg.putalpha(ImageChops.multiply(bg.getchannel("A"), ImageOps.invert(product_mask(base))))
    base.alpha_composite(bg)

    # Add a cleaner contact shadow directly under the setting, not across the whole lower image.
    shadow_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow_layer, "RGBA")
    draw.ellipse((width * 0.24, height * 0.772, width * 0.76, height * 0.878), fill=(38, 41, 45, int(42 * shadow)))
    draw.ellipse((width * 0.36, height * 0.792, width * 0.64, height * 0.842), fill=(28, 31, 35, int(34 * shadow)))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(int(width * 0.018)))
    shadow_layer.putalpha(ImageChops.multiply(shadow_layer.getchannel("A"), ImageOps.invert(product_mask(base))))
    base.alpha_composite(shadow_layer)

    # Pull back the harshest black reflection just slightly; reference metal has deep reflections
    # but still keeps gradation instead of a flat black strip.
    rgb = base.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.075 * tone)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.0 + 0.055 * tone)
    gray = rgb.convert("L")
    dark = ImageOps.invert(ImageOps.autocontrast(gray, cutoff=0.2))
    metal = product_mask(base)
    lift_mask = ImageChops.multiply(dark, metal).filter(ImageFilter.GaussianBlur(1.0))
    lifted = ImageEnhance.Brightness(rgb).enhance(1.0 + 0.055 * metal_soften)
    softened = ImageEnhance.Contrast(lifted).enhance(1.0 - 0.035 * metal_soften)
    return Image.composite(softened, rgb, lift_mask).convert("RGBA")


def point(width: int, height: int, xy: tuple[float, float]) -> tuple[float, float]:
    return xy[0] * width, xy[1] * height


def polygon_mask(size: tuple[int, int], points: list[tuple[float, float]], alpha: int, blur: float) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([point(width, height, p) for p in points], fill=alpha)
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    return mask


def photographic_stone(crop: Image.Image, clarity: float, dark: float, fire: float) -> Image.Image:
    rgb = crop.convert("RGB")
    gray = rgb.convert("L")
    local = gray.filter(ImageFilter.GaussianBlur(4.0))
    dark_detail = ImageOps.autocontrast(ImageChops.subtract(local, gray, scale=2.7, offset=0), cutoff=0.5)
    light_detail = ImageOps.autocontrast(ImageChops.subtract(gray, local, scale=2.0, offset=0), cutoff=0.5)

    burned = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.18 * clarity)
    dodged = ImageEnhance.Brightness(rgb).enhance(1.0 + 0.08 * clarity)
    result = Image.composite(burned, rgb, dark_detail.filter(ImageFilter.GaussianBlur(0.55)))
    result = Image.composite(dodged, result, light_detail.filter(ImageFilter.GaussianBlur(0.45)))
    result = ImageEnhance.Contrast(result).enhance(1.0 + 0.22 * clarity)
    result = result.filter(ImageFilter.UnsharpMask(radius=0.42, percent=int(80 + 90 * clarity), threshold=1))

    size = crop.size
    stone_mask = circle_mask(size, 0.426, 0.8)
    paste_mask = circle_mask(size, 0.434, 4.0)

    # Irregular, photographic-looking dark and bright facets. These are intentionally not radial.
    dark_polys = [
        ([(0.45, 0.25), (0.54, 0.27), (0.51, 0.43), (0.47, 0.43)], 74),
        ([(0.28, 0.39), (0.40, 0.34), (0.38, 0.53), (0.30, 0.52)], 62),
        ([(0.65, 0.37), (0.76, 0.42), (0.70, 0.56), (0.59, 0.49)], 58),
        ([(0.39, 0.62), (0.49, 0.55), (0.48, 0.75), (0.33, 0.72)], 56),
        ([(0.60, 0.61), (0.52, 0.54), (0.56, 0.76), (0.70, 0.69)], 46),
        ([(0.47, 0.47), (0.56, 0.49), (0.52, 0.58), (0.44, 0.56)], 36),
    ]
    bright_polys = [
        ([(0.43, 0.34), (0.50, 0.28), (0.57, 0.37), (0.50, 0.45)], 54),
        ([(0.30, 0.55), (0.42, 0.54), (0.39, 0.66), (0.25, 0.67)], 46),
        ([(0.68, 0.54), (0.57, 0.55), (0.63, 0.68), (0.78, 0.65)], 48),
        ([(0.44, 0.74), (0.52, 0.59), (0.57, 0.76), (0.50, 0.84)], 42),
    ]

    for points, alpha in dark_polys:
        mask = polygon_mask(size, points, int(alpha * dark), 0.65)
        mask = ImageChops.multiply(mask, stone_mask)
        dark_plate = Image.new("RGB", size, (38, 43, 50))
        result = Image.composite(multiply_blend(result, dark_plate, 0.54), result, mask)

    for points, alpha in bright_polys:
        mask = polygon_mask(size, points, int(alpha * clarity), 0.55)
        mask = ImageChops.multiply(mask, stone_mask)
        white_plate = Image.new("RGB", size, (255, 255, 255))
        result = Image.composite(screen_blend(result, white_plate, 0.48), result, mask)

    # Fine table/ray cuts with very low alpha.
    line_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(line_layer, "RGBA")
    width, height = size
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * 0.39
    for turn, alpha, color in [
        (-0.22, 42, (20, 24, 30)),
        (0.04, 36, (255, 255, 255)),
        (0.19, 34, (20, 24, 30)),
        (0.36, 32, (255, 255, 255)),
        (0.58, 36, (22, 26, 32)),
        (0.73, 32, (255, 255, 255)),
    ]:
        angle = -math.pi / 2 + turn * math.tau
        x = cx + math.cos(angle) * radius
        y = cy + math.sin(angle) * radius
        draw.line((cx, cy, x, y), fill=(*color, int(alpha * clarity)), width=1)
    line_layer.putalpha(ImageChops.multiply(line_layer.getchannel("A"), stone_mask))
    result_rgba = result.convert("RGBA")
    result_rgba.alpha_composite(line_layer)

    fire_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(fire_layer, "RGBA")
    for x, y, color, rscale in [
        (0.24, 0.34, (70, 180, 255), 0.010),
        (0.73, 0.38, (255, 205, 92), 0.010),
        (0.31, 0.70, (255, 130, 168), 0.009),
        (0.70, 0.71, (90, 188, 255), 0.009),
    ]:
        r = min(width, height) * rscale
        draw.ellipse((width * x - r, height * y - r, width * x + r, height * y + r), fill=(*color, int(120 * fire)))
    fire_layer = fire_layer.filter(ImageFilter.GaussianBlur(0.9))
    fire_layer.putalpha(ImageChops.multiply(fire_layer.getchannel("A"), stone_mask))
    result_rgba.alpha_composite(fire_layer)

    # Return alpha with a feathered mask so prongs/girdle remain from the render.
    result_rgba.putalpha(paste_mask)
    return result_rgba


def edit(source: Image.Image, floor: float, shadow: float, metal: float, tone: float, clarity: float, dark: float, fire: float) -> Image.Image:
    image = studio_grade(source, floor, shadow, metal, tone)
    width, height = image.size
    bounds = (
        int(width * 0.383),
        int(height * 0.579),
        int(width * 0.617),
        int(height * 0.813),
    )
    crop = image.crop(bounds)
    stone = photographic_stone(crop, clarity, dark, fire)
    image.alpha_composite(stone, dest=(bounds[0], bounds[1]))
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    variants = {
        "v145a_goal_photo_subtle": (0.58, 0.50, 0.46, 0.55, 0.50, 0.42, 0.18),
        "v145b_goal_photo_crisp": (0.64, 0.58, 0.52, 0.74, 0.60, 0.56, 0.20),
        "v145c_goal_photo_depth": (0.70, 0.66, 0.62, 0.94, 0.58, 0.68, 0.16),
        "v145d_goal_photo_clean": (0.50, 0.42, 0.40, 0.42, 0.46, 0.34, 0.14),
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edit(source, *params).save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

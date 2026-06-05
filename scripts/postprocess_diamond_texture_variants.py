from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ellipse_mask(size: tuple[int, int], feather: float, inset: float = 0.055) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    ix = int(width * inset)
    iy = int(height * inset)
    draw.ellipse((ix, iy, width - ix, height - iy), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def multiply_mask(mask_a: Image.Image, mask_b: Image.Image) -> Image.Image:
    return ImageChops.multiply(mask_a.convert("L"), mask_b.convert("L"))


def dodge_burn_from_texture(crop: Image.Image, strength: float, crisp: float) -> Image.Image:
    rgb = crop.convert("RGB")
    gray = rgb.convert("L")
    local = gray.filter(ImageFilter.GaussianBlur(8))
    detail = ImageChops.subtract(gray, local, scale=1.55, offset=128)
    detail = ImageOps.autocontrast(detail, cutoff=0.2)

    dark_mask = ImageChops.subtract(local, gray, scale=2.0, offset=0)
    dark_mask = ImageOps.autocontrast(dark_mask, cutoff=1.0).filter(ImageFilter.GaussianBlur(1.4))
    light_mask = ImageChops.subtract(gray, local, scale=1.8, offset=0)
    light_mask = ImageOps.autocontrast(light_mask, cutoff=1.0).filter(ImageFilter.GaussianBlur(1.1))

    burned = ImageEnhance.Brightness(rgb).enhance(1.0 - 0.18 * strength)
    dodged = ImageEnhance.Brightness(rgb).enhance(1.0 + 0.13 * strength)
    result = Image.composite(burned, rgb, dark_mask)
    result = Image.composite(dodged, result, light_mask)

    contrast = ImageEnhance.Contrast(result).enhance(1.0 + 0.18 * strength)
    result = Image.blend(result, contrast, 0.65)
    detail_rgb = Image.merge("RGB", (detail, detail, detail))
    result = Image.blend(result, detail_rgb, 0.10 + 0.12 * crisp)
    result = ImageEnhance.Sharpness(result).enhance(1.0 + 0.42 * crisp)
    result = result.filter(ImageFilter.UnsharpMask(radius=0.65, percent=int(70 + 95 * crisp), threshold=2))
    return result.convert("RGBA")


def add_selective_dark_facets(crop: Image.Image, mask: Image.Image, amount: float) -> Image.Image:
    overlay = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    width, height = crop.size
    def p(x: float, y: float) -> tuple[float, float]:
        return x * width, y * height

    alpha = int(255 * clamp(amount, 0.0, 1.0))
    facets = [
        ([p(0.46, 0.16), p(0.54, 0.16), p(0.52, 0.34), p(0.48, 0.34)], (10, 12, 16, alpha)),
        ([p(0.26, 0.42), p(0.38, 0.36), p(0.35, 0.55)], (20, 24, 30, int(alpha * 0.72))),
        ([p(0.74, 0.42), p(0.62, 0.36), p(0.65, 0.55)], (20, 24, 30, int(alpha * 0.72))),
        ([p(0.36, 0.68), p(0.47, 0.58), p(0.45, 0.82)], (30, 34, 40, int(alpha * 0.52))),
        ([p(0.64, 0.68), p(0.53, 0.58), p(0.55, 0.82)], (30, 34, 40, int(alpha * 0.52))),
    ]
    for points, color in facets:
        draw.polygon(points, fill=color)

    overlay = overlay.filter(ImageFilter.GaussianBlur(max(1, int(min(width, height) * 0.004))))
    overlay.putalpha(multiply_mask(overlay.getchannel("A"), mask))
    result = crop.copy()
    result.alpha_composite(overlay)
    return result


def add_fire_glints(crop: Image.Image, mask: Image.Image, amount: float) -> Image.Image:
    overlay = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    width, height = crop.size
    glints = [
        (0.25, 0.33, (88, 176, 255), 0.018),
        (0.72, 0.36, (255, 190, 70), 0.017),
        (0.21, 0.64, (255, 130, 165), 0.014),
        (0.79, 0.65, (85, 180, 255), 0.014),
        (0.49, 0.23, (255, 255, 255), 0.012),
        (0.56, 0.76, (255, 210, 110), 0.012),
    ]
    alpha = int(255 * clamp(amount, 0.0, 1.0))
    for x, y, color, radius in glints:
        cx = x * width
        cy = y * height
        r = min(width, height) * radius
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(max(1, int(min(width, height) * 0.009))))
    overlay.putalpha(multiply_mask(overlay.getchannel("A"), mask))
    result = crop.copy()
    result.alpha_composite(overlay)
    return result


def edit(image: Image.Image, bounds: tuple[int, int, int, int], strength: float, crisp: float, facet: float, fire: float) -> Image.Image:
    original = image.convert("RGBA")
    crop = original.crop(bounds).convert("RGBA")
    mask = ellipse_mask(crop.size, 7)

    enhanced = dodge_burn_from_texture(crop, strength, crisp)
    enhanced = Image.blend(crop, enhanced, 0.62)
    enhanced = add_selective_dark_facets(enhanced, mask, facet)
    enhanced = add_fire_glints(enhanced, mask, fire)

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
        "v138a_texture_diamond_clean": (0.70, 0.62, 0.06, 0.08),
        "v138b_texture_diamond_crisp": (0.86, 0.76, 0.08, 0.10),
        "v138c_texture_diamond_fire": (0.78, 0.70, 0.06, 0.17),
        "v138d_texture_diamond_dark": (0.92, 0.78, 0.12, 0.08),
    }
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edit(source, bounds, *params).save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

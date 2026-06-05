from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps, ImageStat


def circle_mask(size: tuple[int, int], radius_scale: float, feather: float) -> Image.Image:
    width, height = size
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * radius_scale
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def mean_luma(image: Image.Image, mask: Image.Image) -> float:
    stat = ImageStat.Stat(image.convert("L"), mask)
    return float(stat.mean[0])


def match_brightness(image: Image.Image, target_luma: float, mask: Image.Image) -> Image.Image:
    current = max(1.0, mean_luma(image, mask))
    return ImageEnhance.Brightness(image).enhance(target_luma / current)


def screen(a: Image.Image, b: Image.Image, amount: float) -> Image.Image:
    inv_a = ImageOps.invert(a.convert("RGB"))
    inv_b = ImageOps.invert(b.convert("RGB"))
    screened = ImageOps.invert(ImageChops.multiply(inv_a, inv_b))
    return Image.blend(a.convert("RGB"), screened, amount)


def prepare_donor(donor_crop: Image.Image, size: tuple[int, int], contrast: float, darken: float) -> Image.Image:
    donor = donor_crop.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    donor = ImageEnhance.Color(donor).enhance(0.30)
    donor = ImageEnhance.Contrast(donor).enhance(contrast)
    donor = ImageEnhance.Brightness(donor).enhance(darken)
    donor = donor.filter(ImageFilter.UnsharpMask(radius=0.55, percent=150, threshold=1))
    return donor.convert("RGBA")


def add_micro_fire(image: Image.Image, mask: Image.Image, amount: float) -> Image.Image:
    result = image.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    width, height = image.size
    flashes = [
        (0.22, 0.31, (70, 178, 255), 0.014),
        (0.78, 0.33, (255, 205, 88), 0.014),
        (0.30, 0.69, (255, 125, 165), 0.013),
        (0.70, 0.72, (92, 185, 255), 0.013),
        (0.49, 0.18, (255, 255, 255), 0.011),
    ]
    for x, y, color, rscale in flashes:
        r = min(width, height) * rscale
        cx = width * x
        cy = height * y
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, int(255 * amount)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(1.3))
    overlay.putalpha(ImageChops.multiply(overlay.getchannel("A"), mask))
    result.alpha_composite(overlay)
    return result


def edit(
    source: Image.Image,
    donor: Image.Image,
    source_bounds: tuple[int, int, int, int],
    donor_bounds: tuple[int, int, int, int],
    opacity: float,
    contrast: float,
    darken: float,
    fire: float,
    radius: float,
) -> Image.Image:
    base = source.convert("RGBA")
    target_crop = base.crop(source_bounds).convert("RGBA")
    donor_crop = donor.crop(donor_bounds)
    mask = circle_mask(target_crop.size, radius, 5.0)
    hard_mask = circle_mask(target_crop.size, radius * 0.985, 1.0)

    donor_prepped = prepare_donor(donor_crop, target_crop.size, contrast, darken)
    donor_prepped = match_brightness(donor_prepped, mean_luma(target_crop, hard_mask) * 0.94, hard_mask)

    # Use donor mostly as internal reflection detail, while retaining the rendered stone edge.
    blended = Image.blend(target_crop.convert("RGB"), donor_prepped.convert("RGB"), opacity)
    screened = screen(blended, target_crop.convert("RGB"), 0.18)
    enhanced = ImageEnhance.Contrast(screened).enhance(1.08)
    enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=0.5, percent=120, threshold=1)).convert("RGBA")
    enhanced = add_micro_fire(enhanced, hard_mask, fire)

    result = base.copy()
    result.paste(enhanced, source_bounds, mask)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--donor", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    donor = Image.open(args.donor).convert("RGBA")
    width, height = source.size
    source_bounds = (
        int(width * 0.383),
        int(height * 0.579),
        int(width * 0.617),
        int(height * 0.813),
    )
    donor_bounds = (446, 286, 754, 594)

    variants = {
        "v140a_donor_diamond_balanced": (0.46, 1.12, 0.92, 0.20, 0.442),
        "v140b_donor_diamond_crisp": (0.58, 1.20, 0.88, 0.24, 0.442),
        "v140c_donor_diamond_dark": (0.66, 1.28, 0.84, 0.20, 0.438),
        "v140d_donor_diamond_fire": (0.54, 1.18, 0.90, 0.34, 0.442),
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, params in variants.items():
        edit(source, donor, source_bounds, donor_bounds, *params).save(output_dir / f"{name}.png")


if __name__ == "__main__":
    main()

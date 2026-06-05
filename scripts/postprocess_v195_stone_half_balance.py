from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path("outputs/ring99")


SOURCES = {
    "v193a": ROOT / "v193a_front_depth_oval_band.png",
    "v194b": ROOT / "v194b_symmetric_clearer_table.png",
}


def ellipse_mask(size: tuple[int, int], cx: float, cy: float, rx: float, ry: float, feather: float) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather))


def side_mask(size: tuple[int, int], cx: float, side: str) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    fade = width * 0.12
    for y in range(height):
        for x in range(width):
            if side == "left":
                value = max(0.0, min(1.0, (cx + fade - x) / (2.0 * fade)))
            else:
                value = max(0.0, min(1.0, (x - cx + fade) / (2.0 * fade)))
            pixels[x, y] = int(value * 255)
    return mask.filter(ImageFilter.GaussianBlur(18))


def radial_center_mask(size: tuple[int, int], cx: float, cy: float, rx: float, ry: float) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    for y in range(height):
        for x in range(width):
            dx = (x - cx) / max(1.0, rx)
            dy = (y - cy) / max(1.0, ry)
            dist = (dx * dx + dy * dy) ** 0.5
            value = max(0.0, min(1.0, 1.0 - (dist - 0.40) / 0.55))
            pixels[x, y] = int(value * 255)
    return mask.filter(ImageFilter.GaussianBlur(10))


def clarity_layer(image: Image.Image, contrast: float, brightness: float, saturation: float, sharpness: float, cutoff: float) -> Image.Image:
    rgb = image.convert("RGB")
    if cutoff:
        rgb = ImageOps.autocontrast(rgb, cutoff=cutoff)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    rgb = ImageEnhance.Color(rgb).enhance(saturation)
    rgb = ImageEnhance.Sharpness(rgb).enhance(sharpness)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.9, percent=120, threshold=1))
    return rgb.convert("RGBA")


def multiply_mask(a: Image.Image, b: Image.Image, scale: float = 1.0) -> Image.Image:
    mask = ImageChops.multiply(a, b)
    if scale != 1.0:
        mask = mask.point(lambda value: max(0, min(255, int(value * scale))))
    return mask


def composite_variant(
    source: Path,
    output: Path,
    side: str,
    side_strength: float,
    contrast: float,
    brightness: float,
    center_strength: float,
    center_brightness: float,
    cutoff: float = 0.6,
) -> None:
    with Image.open(source) as img:
        original = img.convert("RGBA")

    width, height = original.size
    cx = width * 0.505
    cy = height * 0.500
    rx = width * 0.155
    ry = height * 0.165

    diamond = ellipse_mask(original.size, cx, cy, rx, ry, 9)
    side_only = multiply_mask(diamond, side_mask(original.size, cx, side), side_strength)
    center_only = multiply_mask(diamond, radial_center_mask(original.size, cx, cy, rx, ry), center_strength)

    result = original.copy()

    clearer = clarity_layer(original, contrast=contrast, brightness=brightness, saturation=0.88, sharpness=1.26, cutoff=cutoff)
    result = Image.composite(clearer, result, side_only)

    center = clarity_layer(result, contrast=1.18, brightness=center_brightness, saturation=0.92, sharpness=1.16, cutoff=0.25)
    result = Image.composite(center, result, center_only)

    output.parent.mkdir(parents=True, exist_ok=True)
    result.convert("RGB").save(output, quality=96)


def make_contact_sheet(paths: list[Path], output: Path) -> None:
    tile = 390
    label_h = 28
    sheet = Image.new("RGB", (tile * len(paths), tile + label_h), "white")
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        with Image.open(path) as img:
            frame = img.convert("RGB")
            frame.thumbnail((tile, tile))
            x = index * tile + (tile - frame.width) // 2
            y = label_h + (tile - frame.height) // 2
            sheet.paste(frame, (x, y))
        draw.text((index * tile + 8, 8), path.stem[:44], fill=(0, 0, 0))
    sheet.save(output, quality=94)


def main() -> None:
    variants = [
        (SOURCES["v193a"], ROOT / "v195a_v193a_left_half_clarity.png", "left", 0.72, 1.42, 0.92, 0.22, 0.99),
        (SOURCES["v193a"], ROOT / "v195b_v193a_right_half_clarity.png", "right", 0.72, 1.42, 0.92, 0.22, 0.99),
        (SOURCES["v193a"], ROOT / "v195c_v193a_left_balanced_center.png", "left", 0.58, 1.34, 0.95, 0.36, 0.975),
        (SOURCES["v194b"], ROOT / "v195d_v194b_lifted_balanced.png", "left", 0.42, 1.24, 0.98, 0.45, 1.025),
        (SOURCES["v193a"], ROOT / "v195e_v193a_subtle_left_clear.png", "left", 0.38, 1.24, 0.985, 0.18, 1.0, 0.28),
        (SOURCES["v193a"], ROOT / "v195f_v193a_medium_left_clear.png", "left", 0.48, 1.30, 0.970, 0.22, 0.995, 0.38),
    ]
    outputs = []
    for args in variants:
        composite_variant(*args)
        outputs.append(args[1])
        print(args[1])
    make_contact_sheet(outputs, ROOT / "v195_half_balance_contact_sheet.jpg")
    print(ROOT / "v195_half_balance_contact_sheet.jpg")


if __name__ == "__main__":
    main()

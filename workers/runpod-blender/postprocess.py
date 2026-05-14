from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _object_bounds(metadata: dict, tokens: list[str]) -> tuple[int, int, int, int] | None:
    lowered = [token.lower() for token in tokens]
    for item in metadata.get("object_image_bounds", []):
        signature = str(item.get("signature") or item.get("name") or "").lower()
        if any(token in signature for token in lowered):
            bounds = item.get("bounds_px")
            if isinstance(bounds, list) and len(bounds) == 4:
                return tuple(int(value) for value in bounds)
    return None


def _padded_bounds(bounds: tuple[int, int, int, int], image_size: tuple[int, int], padding: int) -> tuple[int, int, int, int]:
    width, height = image_size
    left, top, right, bottom = bounds
    return (
        int(_clamp(left - padding, 0, width)),
        int(_clamp(top - padding, 0, height)),
        int(_clamp(right + padding, 0, width)),
        int(_clamp(bottom + padding, 0, height)),
    )


def _ellipse_mask(size: tuple[int, int], feather: float) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    inset_x = max(1, int(width * 0.035))
    inset_y = max(1, int(height * 0.035))
    draw = ImageDraw.Draw(mask)
    draw.ellipse((inset_x, inset_y, width - inset_x, height - inset_y), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather))
    return mask


def enhance_center_stone(image_path: Path, metadata: dict, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    bounds = _object_bounds(metadata, [token.lower() for token in config.get("object_contains", ["Round_5"])])
    if not bounds:
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    padding = int(config.get("padding_px", 8))
    crop_box = _padded_bounds(bounds, original.size, padding)
    if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
        return False

    crop = original.crop(crop_box).convert("RGBA")
    enhanced = crop.convert("RGB")

    cutoff = float(config.get("autocontrast_cutoff", 0.0))
    if cutoff > 0:
        enhanced = ImageOps.autocontrast(enhanced, cutoff=cutoff)

    if "contrast" in config:
        enhanced = ImageEnhance.Contrast(enhanced).enhance(float(config["contrast"]))
    if "brightness" in config:
        enhanced = ImageEnhance.Brightness(enhanced).enhance(float(config["brightness"]))
    if "saturation" in config:
        enhanced = ImageEnhance.Color(enhanced).enhance(float(config["saturation"]))
    if "sharpness" in config:
        enhanced = ImageEnhance.Sharpness(enhanced).enhance(float(config["sharpness"]))

    if config.get("unsharp_percent", 0):
        enhanced = enhanced.filter(
            ImageFilter.UnsharpMask(
                radius=float(config.get("unsharp_radius", 1.2)),
                percent=int(config.get("unsharp_percent", 120)),
                threshold=int(config.get("unsharp_threshold", 3)),
            )
        )

    blend_amount = _clamp(float(config.get("blend", 0.5)), 0.0, 1.0)
    enhanced_rgba = Image.blend(crop, enhanced.convert("RGBA"), blend_amount)

    mask = _ellipse_mask(crop.size, float(config.get("mask_feather", 12.0)))
    result = original.copy()
    result.paste(enhanced_rgba, crop_box, mask)
    result.save(image_path)
    return True


def apply_postprocess(image_path: Path, metadata: dict, recipe: dict) -> dict:
    config = recipe.get("postprocess") or {}
    if not isinstance(config, dict):
        return {"applied": []}

    applied = []
    center_config = config.get("center_stone")
    if isinstance(center_config, dict) and enhance_center_stone(image_path, metadata, center_config):
        applied.append("center_stone")

    return {"applied": applied}

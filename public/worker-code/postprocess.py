from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


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


def _fallback_bounds(config: dict, image_size: tuple[int, int]) -> tuple[int, int, int, int] | None:
    bounds = config.get("fallback_bounds_norm")
    if not isinstance(bounds, list) or len(bounds) != 4:
        return None
    width, height = image_size
    left, top, right, bottom = [float(value) for value in bounds]
    return (
        int(_clamp(left, 0.0, 1.0) * width),
        int(_clamp(top, 0.0, 1.0) * height),
        int(_clamp(right, 0.0, 1.0) * width),
        int(_clamp(bottom, 0.0, 1.0) * height),
    )


def _union_object_bounds(metadata: dict, image_size: tuple[int, int], padding: int) -> tuple[int, int, int, int] | None:
    bounds_items = []
    width, height = image_size
    for item in metadata.get("object_image_bounds", []):
        bounds = item.get("bounds_px")
        if isinstance(bounds, list) and len(bounds) == 4:
            left, top, right, bottom = [int(value) for value in bounds]
            if right > left and bottom > top:
                bounds_items.append((left, top, right, bottom))
    if not bounds_items:
        return None
    left = min(item[0] for item in bounds_items)
    top = min(item[1] for item in bounds_items)
    right = max(item[2] for item in bounds_items)
    bottom = max(item[3] for item in bounds_items)
    return (
        int(_clamp(left - padding, 0, width)),
        int(_clamp(top - padding, 0, height)),
        int(_clamp(right + padding, 0, width)),
        int(_clamp(bottom + padding, 0, height)),
    )


def _object_bounds_mask(metadata: dict, image_size: tuple[int, int], padding: int, feather: float) -> Image.Image | None:
    width, height = image_size
    mask = Image.new("L", image_size, 0)
    draw = ImageDraw.Draw(mask)
    found = False
    for item in metadata.get("object_image_bounds", []):
        bounds = item.get("bounds_px")
        if not isinstance(bounds, list) or len(bounds) != 4:
            continue
        left, top, right, bottom = [int(value) for value in bounds]
        if right <= left or bottom <= top:
            continue
        if ((right - left) * (bottom - top)) / max(1, width * height) > 0.65:
            continue
        found = True
        draw.rectangle(
            (
                int(_clamp(left - padding, 0, width)),
                int(_clamp(top - padding, 0, height)),
                int(_clamp(right + padding, 0, width)),
                int(_clamp(bottom + padding, 0, height)),
            ),
            fill=255,
        )
    if not found:
        return None
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


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


def _feathered_rectangle_mask(size: tuple[int, int], feather: float) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    inset = max(1, int(max(width, height) * 0.02))
    draw = ImageDraw.Draw(mask)
    draw.rectangle((inset, inset, width - inset, height - inset), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather))
    return mask


def _image_product_mask(image: Image.Image, cutoff: float = 0.4) -> Image.Image:
    rgb = image.convert("RGB")
    red, green, blue = rgb.split()
    gray = rgb.convert("L")
    not_white = ImageOps.invert(ImageOps.posterize(gray, 5))
    chroma = ImageChops.add(ImageChops.difference(red, green), ImageChops.difference(blue, green), scale=1.0)
    mask = ImageChops.lighter(not_white, ImageOps.autocontrast(chroma))
    mask = ImageOps.autocontrast(mask, cutoff=cutoff)
    return mask.filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(5.5))


def replace_studio_background(image_path: Path, metadata: dict, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    width, height = original.size
    top = config.get("top_color", [246, 246, 245])
    floor = config.get("floor_color", [238, 238, 236])
    vignette_amount = float(config.get("vignette", 10.0))
    floor_start = float(config.get("floor_start", 0.52))
    floor_strength = float(config.get("floor_strength", 1.0))

    background = Image.new("RGBA", original.size, (255, 255, 255, 255))
    pixels = background.load()
    for y in range(height):
        yy = y / max(1, height - 1)
        floor_mix = _clamp((yy - floor_start) / max(0.01, 1.0 - floor_start), 0.0, 1.0)
        floor_mix = floor_mix * floor_mix * (3.0 - 2.0 * floor_mix)
        floor_mix *= floor_strength
        for x in range(width):
            xx = abs((x / max(1, width - 1)) - 0.5) * 2.0
            vignette = int((xx ** 1.8) * vignette_amount + max(0.0, yy - 0.62) * 8.0)
            rgb = [
                int(_clamp(top[i] * (1.0 - floor_mix) + floor[i] * floor_mix - vignette, 0, 255))
                for i in range(3)
            ]
            pixels[x, y] = (rgb[0], rgb[1], rgb[2], 255)

    protect = _image_product_mask(original, float(config.get("mask_cutoff", 0.35)))
    object_region = _object_bounds_mask(
        metadata,
        original.size,
        int(config.get("object_padding_px", 10)),
        float(config.get("object_feather", 3.0)),
    )
    if object_region:
        protect = ImageChops.multiply(protect, object_region)
        bright_object_keep = object_region.point(lambda value: int(value * float(config.get("bright_object_keep", 0.24))))
        protect = ImageChops.lighter(protect, bright_object_keep)
        protect = protect.filter(ImageFilter.GaussianBlur(float(config.get("protect_feather", 1.2))))
    else:
        fallback = config.get("fallback_product_bounds_norm", [0.02, 0.49, 0.98, 0.96])
        left, top, right, bottom = [float(value) for value in fallback]
        fallback_region = Image.new("L", original.size, 0)
        draw = ImageDraw.Draw(fallback_region)
        draw.ellipse(
            (
                int(_clamp(left, 0.0, 1.0) * width),
                int(_clamp(top, 0.0, 1.0) * height),
                int(_clamp(right, 0.0, 1.0) * width),
                int(_clamp(bottom, 0.0, 1.0) * height),
            ),
            fill=255,
        )
        fallback_region = fallback_region.filter(ImageFilter.GaussianBlur(4.0))
        protect = ImageChops.multiply(protect, fallback_region)
        bright_object_keep = fallback_region.point(lambda value: int(value * float(config.get("bright_object_keep", 0.24))))
        protect = ImageChops.lighter(protect, bright_object_keep)

    shadow = Image.new("RGBA", original.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow, "RGBA")
    for item in config.get("shadows", []):
        cx = float(item.get("cx", 0.5))
        cy = float(item.get("cy", 0.81))
        rx = float(item.get("rx", 0.42))
        ry = float(item.get("ry", 0.055))
        alpha = int(_clamp(float(item.get("alpha", 34)), 0, 255))
        color = item.get("color", [54, 56, 58])
        draw.ellipse(
            (
                width * (cx - rx),
                height * (cy - ry),
                width * (cx + rx),
                height * (cy + ry),
            ),
            fill=(int(color[0]), int(color[1]), int(color[2]), alpha),
        )
    shadow = shadow.filter(ImageFilter.GaussianBlur(float(config.get("shadow_blur", 28.0))))
    shadow.putalpha(ImageChops.multiply(shadow.getchannel("A"), ImageOps.invert(protect.filter(ImageFilter.MaxFilter(5)))))
    background.alpha_composite(shadow)

    result = Image.composite(original, background, protect)
    result.save(image_path)
    return True


def enhance_product(image_path: Path, metadata: dict, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    crop_box = _union_object_bounds(metadata, original.size, int(config.get("padding_px", 18)))
    if not crop_box or crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
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
                radius=float(config.get("unsharp_radius", 0.8)),
                percent=int(config.get("unsharp_percent", 80)),
                threshold=int(config.get("unsharp_threshold", 3)),
            )
        )

    blend_amount = _clamp(float(config.get("blend", 0.35)), 0.0, 1.0)
    enhanced_rgba = Image.blend(crop, enhanced.convert("RGBA"), blend_amount)
    mask = _feathered_rectangle_mask(crop.size, float(config.get("mask_feather", 42.0)))
    result = original.copy()
    result.paste(enhanced_rgba, crop_box, mask)
    result.save(image_path)
    return True


def enhance_center_stone(image_path: Path, metadata: dict, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    bounds = _object_bounds(metadata, [token.lower() for token in config.get("object_contains", ["Round_5"])])
    if not bounds:
        bounds = _fallback_bounds(config, original.size)
    if not bounds:
        return False

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

    detail_amount = float(config.get("detail_amount", 0.0))
    if detail_amount > 0:
        lab = enhanced.convert("LAB")
        lightness, channel_a, channel_b = lab.split()
        boosted = lightness.filter(
            ImageFilter.UnsharpMask(
                radius=float(config.get("detail_radius", 4.0)),
                percent=int(_clamp(detail_amount, 0.0, 1.0) * 260),
                threshold=int(config.get("detail_threshold", 1)),
            )
        )
        enhanced = Image.merge("LAB", (boosted, channel_a, channel_b)).convert("RGB")

    blend_amount = _clamp(float(config.get("blend", 0.5)), 0.0, 1.0)
    enhanced_rgba = Image.blend(crop, enhanced.convert("RGBA"), blend_amount)

    mask = _ellipse_mask(crop.size, float(config.get("mask_feather", 12.0)))
    result = original.copy()
    result.paste(enhanced_rgba, crop_box, mask)
    result.save(image_path)
    return True


def _half_gradient_mask(size: tuple[int, int], side: str, feather: float) -> Image.Image:
    width, height = size
    center_x = width * 0.5
    fade = max(1.0, width * 0.18)
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    for y in range(height):
        for x in range(width):
            if side == "left":
                value = _clamp((center_x + fade - x) / (2.0 * fade), 0.0, 1.0)
            else:
                value = _clamp((x - center_x + fade) / (2.0 * fade), 0.0, 1.0)
            pixels[x, y] = int(value * 255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def _masked_luma_stats(image: Image.Image, mask: Image.Image) -> dict:
    gray = image.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    gray_data = list(gray.getdata())
    edge_data = list(edges.getdata())
    mask_data = list(mask.getdata())
    values = [value for value, alpha in zip(gray_data, mask_data) if alpha > 16]
    edge_values = [value for value, alpha in zip(edge_data, mask_data) if alpha > 16]
    if not values:
        return {"mean": 0.0, "std": 0.0, "edge": 0.0, "clarity": 0.0}
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    std = variance ** 0.5
    edge = sum(edge_values) / max(1, len(edge_values))
    milk_penalty = max(0.0, mean - 150.0) * 0.13
    clarity = std + edge * 0.32 - milk_penalty
    return {"mean": mean, "std": std, "edge": edge, "clarity": clarity}


def adaptive_center_stone_symmetry(image_path: Path, metadata: dict, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    bounds = _object_bounds(metadata, [token.lower() for token in config.get("object_contains", ["Diamond_Round_11"])])
    if not bounds:
        bounds = _fallback_bounds(config, original.size)
    if not bounds:
        return False

    padding = int(config.get("padding_px", 24))
    crop_box = _padded_bounds(bounds, original.size, padding)
    if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
        return False

    crop = original.crop(crop_box).convert("RGBA")
    rgb = crop.convert("RGB")
    ellipse = _ellipse_mask(crop.size, float(config.get("mask_feather", 12.0)))
    left_mask = ImageChops.multiply(ellipse, _half_gradient_mask(crop.size, "left", float(config.get("split_feather", 14.0))))
    right_mask = ImageChops.multiply(ellipse, _half_gradient_mask(crop.size, "right", float(config.get("split_feather", 14.0))))
    left_stats = _masked_luma_stats(rgb, left_mask)
    right_stats = _masked_luma_stats(rgb, right_mask)

    requested_side = str(config.get("target_side", "auto")).lower()
    if requested_side in {"left", "right"}:
        target_side = requested_side
    else:
        target_side = "left" if left_stats["clarity"] <= right_stats["clarity"] else "right"

    target_stats = left_stats if target_side == "left" else right_stats
    other_stats = right_stats if target_side == "left" else left_stats
    clarity_delta = abs(left_stats["clarity"] - right_stats["clarity"])
    mean_delta = target_stats["mean"] - other_stats["mean"]
    if clarity_delta < float(config.get("min_clarity_delta", 0.8)) and abs(mean_delta) < float(config.get("min_mean_delta", 2.0)):
        return False

    strength = float(config.get("strength", 0.42))
    if config.get("adaptive_strength", True):
        strength *= _clamp((clarity_delta / 12.0) + (max(0.0, mean_delta) / 55.0), 0.45, 1.25)
    strength = _clamp(strength, 0.0, float(config.get("max_strength", 0.58)))

    enhanced = rgb
    cutoff = float(config.get("autocontrast_cutoff", 0.28))
    if cutoff > 0:
        enhanced = ImageOps.autocontrast(enhanced, cutoff=cutoff)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(float(config.get("contrast", 1.26)))
    enhanced = ImageEnhance.Brightness(enhanced).enhance(float(config.get("brightness", 0.985)))
    enhanced = ImageEnhance.Color(enhanced).enhance(float(config.get("saturation", 0.90)))
    enhanced = ImageEnhance.Sharpness(enhanced).enhance(float(config.get("sharpness", 1.22)))
    if config.get("unsharp_percent", 0):
        enhanced = enhanced.filter(
            ImageFilter.UnsharpMask(
                radius=float(config.get("unsharp_radius", 0.9)),
                percent=int(config.get("unsharp_percent", 105)),
                threshold=int(config.get("unsharp_threshold", 1)),
            )
        )

    target_mask = left_mask if target_side == "left" else right_mask
    target_mask = target_mask.point(lambda value: int(_clamp(value * strength, 0, 255)))
    corrected_crop = Image.composite(enhanced.convert("RGBA"), crop, target_mask)
    result = original.copy()
    result.paste(corrected_crop, crop_box, ellipse)
    result.save(image_path)
    metadata["center_stone_symmetry"] = {
        "target_side": target_side,
        "strength": strength,
        "left": left_stats,
        "right": right_stats,
    }
    return True


def add_diamond_facets(image_path: Path, metadata: dict, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    bounds = _object_bounds(metadata, [token.lower() for token in config.get("object_contains", ["Round_5"])])
    if not bounds:
        bounds = _fallback_bounds(config, original.size)
    if not bounds:
        return False

    crop_box = _padded_bounds(bounds, original.size, int(config.get("padding_px", 0)))
    if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
        return False

    crop = original.crop(crop_box).convert("RGBA")
    width, height = crop.size
    cx = width * float(config.get("center_x", 0.5))
    cy = height * float(config.get("center_y", 0.52))
    rx = width * float(config.get("radius_x", 0.43))
    ry = height * float(config.get("radius_y", 0.40))
    facets = max(12, int(config.get("facets", 24)))
    inner_ratio = float(config.get("inner_ratio", 0.24))
    dark_alpha = int(_clamp(float(config.get("dark_alpha", 0.32)), 0.0, 1.0) * 255)
    light_alpha = int(_clamp(float(config.get("light_alpha", 0.18)), 0.0, 1.0) * 255)
    chroma_alpha = int(_clamp(float(config.get("chroma_alpha", 0.08)), 0.0, 1.0) * 255)

    overlay = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    colors = [
        (18, 20, 24, dark_alpha),
        (255, 255, 255, light_alpha),
        (48, 54, 62, int(dark_alpha * 0.72)),
        (255, 255, 255, int(light_alpha * 0.75)),
        (90, 170, 255, chroma_alpha),
        (255, 196, 80, chroma_alpha),
    ]

    start = -math.pi / 2.0
    for index in range(facets):
        a0 = start + index * math.tau / facets
        a1 = start + (index + 1) * math.tau / facets
        mid = (a0 + a1) * 0.5
        inner = inner_ratio * (1.35 if index % 2 == 0 else 0.82)
        p0 = (cx + math.cos(a0) * rx, cy + math.sin(a0) * ry)
        p1 = (cx + math.cos(a1) * rx, cy + math.sin(a1) * ry)
        pc = (cx + math.cos(mid) * rx * inner, cy + math.sin(mid) * ry * inner)
        draw.polygon([pc, p0, p1], fill=colors[index % len(colors)])

    table_radius = float(config.get("table_radius", 0.18))
    table = [
        (
            cx + math.cos(start + index * math.tau / facets) * rx * table_radius,
            cy + math.sin(start + index * math.tau / facets) * ry * table_radius,
        )
        for index in range(facets)
    ]
    draw.polygon(table, fill=(255, 255, 255, int(light_alpha * 0.45)))

    line_alpha = int(_clamp(float(config.get("line_alpha", 0.14)), 0.0, 1.0) * 255)
    line_color = (22, 24, 28, line_alpha)
    for index in range(0, facets, 2):
        angle = start + index * math.tau / facets
        draw.line(
            [
                (cx + math.cos(angle) * rx * table_radius, cy + math.sin(angle) * ry * table_radius),
                (cx + math.cos(angle) * rx, cy + math.sin(angle) * ry),
            ],
            fill=line_color,
            width=max(1, int(min(width, height) * 0.006)),
        )

    mask = _ellipse_mask(crop.size, float(config.get("mask_feather", 10.0)))
    alpha = overlay.getchannel("A")
    alpha = Image.composite(alpha, Image.new("L", crop.size, 0), mask)
    overlay.putalpha(alpha)
    result_crop = crop.copy()
    result_crop.alpha_composite(overlay)
    result = original.copy()
    result.paste(result_crop, crop_box, mask)
    result.save(image_path)
    return True


def soften_side_regions(image_path: Path, config: dict) -> bool:
    if not config.get("enabled", False):
        return False

    regions = config.get("regions_norm")
    if not isinstance(regions, list) or not regions:
        return False

    with Image.open(image_path) as source:
        original = source.convert("RGBA")

    width, height = original.size
    result = original.copy()
    blur_radius = float(config.get("blur_radius", 3.0))
    brightness = float(config.get("brightness", 1.04))
    contrast = float(config.get("contrast", 0.92))
    saturation = float(config.get("saturation", 0.82))
    blend_amount = _clamp(float(config.get("blend", 0.45)), 0.0, 1.0)
    feather = float(config.get("mask_feather", 28.0))

    for region in regions:
        if not isinstance(region, list) or len(region) != 4:
            continue
        left, top, right, bottom = [float(value) for value in region]
        crop_box = (
            int(_clamp(left, 0.0, 1.0) * width),
            int(_clamp(top, 0.0, 1.0) * height),
            int(_clamp(right, 0.0, 1.0) * width),
            int(_clamp(bottom, 0.0, 1.0) * height),
        )
        if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
            continue

        crop = original.crop(crop_box).convert("RGBA")
        softened = crop.convert("RGB").filter(ImageFilter.GaussianBlur(radius=blur_radius))
        softened = ImageEnhance.Brightness(softened).enhance(brightness)
        softened = ImageEnhance.Contrast(softened).enhance(contrast)
        softened = ImageEnhance.Color(softened).enhance(saturation)
        softened_rgba = Image.blend(crop, softened.convert("RGBA"), blend_amount)
        if config.get("mask_shape") == "ellipse":
            mask = _ellipse_mask(crop.size, feather)
        else:
            mask = _feathered_rectangle_mask(crop.size, feather)
        result.paste(softened_rgba, crop_box, mask)

    result.save(image_path)
    return True


def apply_postprocess(image_path: Path, metadata: dict, recipe: dict) -> dict:
    config = recipe.get("postprocess") or {}
    if not isinstance(config, dict):
        return {"applied": []}

    applied = []
    background_config = config.get("studio_background")
    if isinstance(background_config, dict) and replace_studio_background(image_path, metadata, background_config):
        applied.append("studio_background")

    product_config = config.get("product")
    if isinstance(product_config, dict) and enhance_product(image_path, metadata, product_config):
        applied.append("product")

    side_config = config.get("side_soften")
    if isinstance(side_config, dict) and soften_side_regions(image_path, side_config):
        applied.append("side_soften")

    center_config = config.get("center_stone")
    if isinstance(center_config, dict) and enhance_center_stone(image_path, metadata, center_config):
        applied.append("center_stone")

    symmetry_config = config.get("center_stone_symmetry")
    if isinstance(symmetry_config, dict) and adaptive_center_stone_symmetry(image_path, metadata, symmetry_config):
        applied.append("center_stone_symmetry")

    final_region_config = config.get("final_regions")
    if isinstance(final_region_config, dict) and soften_side_regions(image_path, final_region_config):
        applied.append("final_regions")

    facet_config = config.get("diamond_facets")
    if isinstance(facet_config, dict) and add_diamond_facets(image_path, metadata, facet_config):
        applied.append("diamond_facets")

    return {"applied": applied}

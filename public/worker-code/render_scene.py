from __future__ import annotations

import argparse
import json
import math
import tempfile
import urllib.request
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Vector


DEFAULT_RECIPE = {
    "render": {
        "resolution": [1400, 1400],
        "samples": 192,
        "denoise": True,
        "view_transform": "Filmic",
        "look": "Medium High Contrast",
        "exposure": 0.0,
        "gamma": 1.0,
        "transparent": False,
    },
    "camera": {
        "position": [0.0, -4.2, 2.1],
        "target": [0.0, 0.0, 0.32],
        "focal_length": 90,
        "depth_of_field": {"enabled": True, "f_stop": 7.5},
    },
    "world": {"color": [1.0, 1.0, 1.0], "strength": 0.18},
    "background": {"color": [0.98, 0.98, 0.965, 1.0], "plane_size": 8.0, "plane_z": -0.04},
    "model": {
        "auto_center": True,
        "auto_scale": True,
        "target_size": 2.0,
        "rotation_degrees": [0.0, 0.0, 0.0],
        "ground_to_plane": True,
        "ground_clearance": 0.015,
        "shade_smooth": True,
        "shade_smooth_exclude_contains": ["diamond", "stone", "gem", "round_", "emerald", "zirconia", "brillant"],
        "include_contains": [],
        "exclude_contains": ["light", "camera", "cube", "helper", "swatch", "plane"],
    },
    "material_strategy": "override",
    "material_map": [
        {"contains": ["metal", "band", "prong", "basket", "shank"], "material": "white_gold_polished"},
        {"contains": ["center", "diamond", "stone", "gem"], "material": "diamond_center"},
        {"contains": ["side", "pave"], "material": "diamond_side"},
    ],
    "materials": {
        "white_gold_polished": {
            "type": "metal",
            "base_color": [0.86, 0.84, 0.8, 1.0],
            "metallic": 1.0,
            "roughness": 0.14,
            "specular_ior_level": 0.78,
        },
        "diamond_center": {
            "type": "gem",
            "base_color": [1.0, 0.98, 0.92, 1.0],
            "roughness": 0.0,
            "alpha": 0.24,
            "transmission_weight": 1.0,
            "ior": 2.417,
        },
        "diamond_side": {
            "type": "gem",
            "base_color": [1.0, 0.98, 0.94, 1.0],
            "roughness": 0.0,
            "alpha": 0.3,
            "transmission_weight": 1.0,
            "ior": 2.417,
        },
    },
    "lights": [
        {"name": "large_top_softbox", "type": "AREA", "position": [0.0, -1.6, 3.0], "rotation_degrees": [62, 0, 0], "size": 3.2, "power": 520},
        {"name": "left_front_strip", "type": "AREA", "position": [-2.4, -2.4, 1.2], "rotation_degrees": [70, 0, -34], "size": 1.1, "power": 160},
        {"name": "right_rim_strip", "type": "AREA", "position": [2.3, -0.2, 1.4], "rotation_degrees": [78, 0, 45], "size": 0.75, "power": 125},
        {"name": "diamond_sparkle_pin_1", "type": "POINT", "position": [-0.65, -1.15, 1.45], "power": 55, "shadow_soft_size": 0.018},
        {"name": "diamond_sparkle_pin_2", "type": "POINT", "position": [0.82, -1.35, 1.75], "power": 38, "shadow_soft_size": 0.012},
    ],
    "reflection_cards": [
        {
            "name": "dark_lower_reflection",
            "position": [0.0, -2.8, 0.35],
            "rotation_degrees": [72.0, 0.0, 0.0],
            "size": [3.6, 0.75],
            "color": [0.035, 0.035, 0.038, 1.0],
            "visible_to_camera": False,
        },
        {
            "name": "soft_gray_side_reflection",
            "position": [2.4, -1.6, 0.85],
            "rotation_degrees": [65.0, 0.0, 58.0],
            "size": [1.8, 1.15],
            "color": [0.38, 0.38, 0.39, 1.0],
            "visible_to_camera": False,
        },
    ],
}


def deep_merge(base, override):
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    import sys

    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path: Path):
    before = set(bpy.data.objects)
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif suffix == ".stl":
        bpy.ops.wm.stl_import(filepath=str(path))
    elif suffix == ".blend":
        with bpy.data.libraries.load(str(path), link=False) as (source, target):
            target.objects = source.objects
            target.materials = source.materials
        for obj in target.objects:
            if obj:
                bpy.context.collection.objects.link(obj)
    else:
        raise ValueError(f"Unsupported model type: {suffix}")
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def source_scene_mesh_objects(recipe):
    config = recipe.get("source_scene", {})
    include = [token.lower() for token in config.get("metadata_include_contains", [])]
    exclude = [token.lower() for token in config.get("metadata_exclude_contains", [])]
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        signature = object_signature(obj)
        if include and not any(token in signature for token in include):
            continue
        if exclude and any(token in signature for token in exclude):
            continue
        selected.append(obj)
    return selected


def setup_source_scene(path: Path, recipe):
    config = recipe.get("source_scene", {})
    bpy.ops.wm.open_mainfile(filepath=str(path))

    scene_name = config.get("scene_name")
    if scene_name and scene_name in bpy.data.scenes:
        bpy.context.window.scene = bpy.data.scenes[scene_name]

    camera_name = config.get("camera_name")
    if camera_name and camera_name in bpy.data.objects and bpy.data.objects[camera_name].type == "CAMERA":
        bpy.context.scene.camera = bpy.data.objects[camera_name]

    setup_render(recipe)

    if config.get("use_recipe_camera", False):
        setup_camera(recipe)

    if config.get("apply_recipe_materials", False):
        assign_materials(source_scene_mesh_objects(recipe), recipe)

    apply_source_scene_adjustments(recipe)
    apply_source_camera_adjustment(recipe)
    add_reflection_cards_from_configs(config.get("reflection_cards", []))

    return source_scene_mesh_objects(recipe)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def source_camera_target(config):
    tokens = [token.lower() for token in config.get("target_contains", ["Diamond_Round_11"])]
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and any(token in object_signature(obj) for token in tokens)]
    if objects:
        mins, maxs = object_bounds(objects)
        return (mins + maxs) * 0.5
    return Vector(config.get("target", [0.0, 0.0, 0.0]))


def apply_source_camera_adjustment(recipe):
    config = recipe.get("source_scene", {}).get("camera_orbit", {})
    if not config.get("enabled", False):
        return
    camera = bpy.context.scene.camera
    if camera is None:
        return

    target = source_camera_target(config)
    if "target_offset" in config:
        target += Vector(config["target_offset"])

    relative = camera.location - target
    distance_scale = float(config.get("distance_scale", 1.0))
    relative *= distance_scale

    yaw = math.radians(float(config.get("yaw_degrees", 0.0)))
    cos_y = math.cos(yaw)
    sin_y = math.sin(yaw)
    relative = Vector((relative.x * cos_y - relative.y * sin_y, relative.x * sin_y + relative.y * cos_y, relative.z))

    if "height_scale" in config:
        relative.z *= float(config["height_scale"])
    if "height_offset" in config:
        relative.z += float(config["height_offset"])

    camera.location = target + relative
    look_at(camera, target)

    if "focal_length" in config and hasattr(camera.data, "lens"):
        camera.data.lens = float(config["focal_length"])
    if "shift_x" in config and hasattr(camera.data, "shift_x"):
        camera.data.shift_x = float(config["shift_x"])
    if "shift_y" in config and hasattr(camera.data, "shift_y"):
        camera.data.shift_y = float(config["shift_y"])


def apply_source_scene_adjustments(recipe):
    config = recipe.get("source_scene", {})
    for adjustment in config.get("group_adjustments", []):
        tokens = [token.lower() for token in adjustment.get("contains", [])]
        if not tokens:
            continue
        matched = [
            obj
            for obj in bpy.context.scene.objects
            if obj.type == "MESH" and not obj.hide_render and any(token in object_signature(obj) for token in tokens)
        ]
        if not matched:
            continue
        mins, maxs = object_bounds(matched)
        pivot = (mins + maxs) * 0.5
        if "pivot" in adjustment:
            pivot = Vector(adjustment["pivot"])
        rotation = [math.radians(float(v)) for v in adjustment.get("rotation_degrees", [0.0, 0.0, 0.0])]
        rotation_matrix = Euler(rotation, "XYZ").to_matrix().to_4x4()
        scale = transform_vector(adjustment.get("scale", 1.0), 1.0)
        translation = transform_vector(adjustment.get("translation", [0, 0, 0]), 0.0)
        for obj in matched:
            relative = obj.location - pivot
            relative = Vector((relative.x * scale.x, relative.y * scale.y, relative.z * scale.z))
            obj.location = pivot + (rotation_matrix @ relative) + translation
            obj.rotation_euler.rotate(Euler(rotation, "XYZ"))
            obj.scale.x *= scale.x
            obj.scale.y *= scale.y
            obj.scale.z *= scale.z

    for adjustment in config.get("object_adjustments", []):
        tokens = [token.lower() for token in adjustment.get("contains", [])]
        if not tokens:
            continue
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH" or not any(token in object_signature(obj) for token in tokens):
                continue
            if "hide_render" in adjustment:
                obj.hide_render = bool(adjustment["hide_render"])
            if "hide_viewport" in adjustment:
                obj.hide_viewport = bool(adjustment["hide_viewport"])
            if "position" in adjustment:
                obj.location = Vector(adjustment["position"])
            if "rotation_degrees" in adjustment:
                obj.rotation_euler = [math.radians(v) for v in adjustment["rotation_degrees"]]
            if "scale" in adjustment:
                obj.scale = transform_vector(adjustment["scale"])
            material_adjust = adjustment.get("source_material_adjust")
            if material_adjust:
                for slot in obj.material_slots:
                    if slot.material:
                        slot.material = adjust_source_material(slot.material, material_adjust)

    for adjustment in config.get("light_adjustments", []):
        tokens = [token.lower() for token in adjustment.get("contains", [])]
        if not tokens:
            continue
        for obj in bpy.context.scene.objects:
            if obj.type != "LIGHT" or not any(token in obj.name.lower() for token in tokens):
                continue
            data = obj.data
            if "hide_render" in adjustment:
                obj.hide_render = bool(adjustment["hide_render"])
            if "position" in adjustment:
                obj.location = Vector(adjustment["position"])
            if "rotation_degrees" in adjustment:
                obj.rotation_euler = [math.radians(v) for v in adjustment["rotation_degrees"]]
            if "power" in adjustment:
                data.energy = float(adjustment["power"])
            if "power_scale" in adjustment:
                data.energy *= float(adjustment["power_scale"])
            if "size" in adjustment and hasattr(data, "size"):
                data.size = float(adjustment["size"])
            if "size_y" in adjustment and hasattr(data, "size_y"):
                data.size_y = float(adjustment["size_y"])
            if "color" in adjustment:
                data.color = adjustment["color"][:3]


def filter_product_objects(objects, settings):
    include = [token.lower() for token in settings.get("include_contains", [])]
    exclude = [token.lower() for token in settings.get("exclude_contains", [])]
    selected = []
    for obj in objects:
        signature = f"{obj.name} {' '.join(slot.material.name for slot in obj.material_slots if slot.material)}".lower()
        if include and not any(token in signature for token in include):
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        if exclude and any(token in signature for token in exclude):
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        selected.append(obj)
    return selected


def normalize(objects, settings):
    if settings.get("shade_smooth", True):
        smooth_exclude = [token.lower() for token in settings.get("shade_smooth_exclude_contains", [])]
        for obj in objects:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            if any(token in object_signature(obj) for token in smooth_exclude):
                bpy.ops.object.shade_flat()
            else:
                bpy.ops.object.shade_smooth()
            obj.select_set(False)

    bpy.context.view_layer.update()
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)

    center = (mins + maxs) * 0.5
    size = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z)
    scale = settings.get("target_size", 2.0) / size if settings.get("auto_scale", True) and size > 0 else 1.0
    for obj in objects:
        if settings.get("auto_center", True):
            obj.location -= center
        obj.scale *= scale


def transform_vector(value, default=1.0):
    if isinstance(value, (int, float)):
        return Vector((float(value), float(value), float(value)))
    if isinstance(value, list):
        values = [float(item) for item in value]
        if len(values) == 2:
            return Vector((values[0], values[1], default))
        if len(values) >= 3:
            return Vector((values[0], values[1], values[2]))
    return Vector((default, default, default))


def apply_object_transforms(objects, model_settings):
    transforms = model_settings.get("object_transforms", [])
    if not transforms:
        return

    for transform in transforms:
        contains = [token.lower() for token in transform.get("contains", [])]
        if not contains:
            continue
        matched = [obj for obj in objects if any(token in object_signature(obj) for token in contains)]
        if not matched:
            continue

        mins, maxs = object_bounds(matched)
        pivot = (mins + maxs) * 0.5
        scale = transform_vector(transform.get("scale", 1.0), 1.0)
        translation = transform_vector(transform.get("translation", [0, 0, 0]), 0.0)

        for obj in matched:
            relative = obj.location - pivot
            obj.location = pivot + Vector((relative.x * scale.x, relative.y * scale.y, relative.z * scale.z)) + translation
            obj.scale.x *= scale.x
            obj.scale.y *= scale.y
            obj.scale.z *= scale.z


def add_generated_band(objects, model_settings):
    config = model_settings.get("generated_band") or {}
    if not config.get("enabled", False):
        return []

    segments = max(24, int(config.get("segments", 128)))
    tube_segments = max(8, int(config.get("tube_segments", 18)))
    radius_x = float(config.get("radius_x", 0.86))
    radius_z = float(config.get("radius_z", 0.48))
    tube_radius = float(config.get("tube_radius", 0.055))
    tube_y_scale = float(config.get("tube_y_scale", 1.0))
    center = Vector(transform_vector(config.get("center", [0, 0, 0]), 0.0))

    vertices = []
    faces = []
    for i in range(segments):
        theta = 2.0 * math.pi * i / segments
        ring_center = center + Vector((radius_x * math.cos(theta), 0.0, radius_z * math.sin(theta)))
        normal = Vector((radius_z * math.cos(theta), 0.0, radius_x * math.sin(theta)))
        if normal.length < 0.00001:
            normal = Vector((1.0, 0.0, 0.0))
        else:
            normal.normalize()
        binormal = Vector((0.0, 1.0, 0.0))
        for j in range(tube_segments):
            phi = 2.0 * math.pi * j / tube_segments
            point = ring_center + normal * (math.cos(phi) * tube_radius) + binormal * (math.sin(phi) * tube_radius * tube_y_scale)
            vertices.append(tuple(point))

    for i in range(segments):
        next_i = (i + 1) % segments
        for j in range(tube_segments):
            next_j = (j + 1) % tube_segments
            faces.append(
                (
                    i * tube_segments + j,
                    next_i * tube_segments + j,
                    next_i * tube_segments + next_j,
                    i * tube_segments + next_j,
                )
            )

    mesh = bpy.data.meshes.new(config.get("mesh_name", "generated_plain_band_mesh"))
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    band = bpy.data.objects.new(config.get("name", "generated_metal_band_shank"), mesh)
    bpy.context.collection.objects.link(band)
    band.select_set(True)
    bpy.context.view_layer.objects.active = band
    bpy.ops.object.shade_smooth()
    band.select_set(False)
    objects.append(band)
    return [band]


def object_bounds(objects):
    bpy.context.view_layer.update()
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)
    return mins, maxs


def bounds_summary(objects):
    mins, maxs = object_bounds(objects)
    size = maxs - mins
    return {
        "min": list(mins),
        "max": list(maxs),
        "size": list(size),
        "center": list((mins + maxs) * 0.5),
        "max_dimension": max(size.x, size.y, size.z),
    }


def transform_model(objects, model_settings, background_settings):
    rotation = model_settings.get("rotation_degrees", [0, 0, 0])
    if any(abs(float(value)) > 0.0001 for value in rotation):
        matrix = Euler([math.radians(float(value)) for value in rotation], "XYZ").to_matrix().to_4x4()
        for obj in objects:
            obj.matrix_world = matrix @ obj.matrix_world

    translation = model_settings.get("translation", [0, 0, 0])
    if any(abs(float(value)) > 0.0001 for value in translation):
        offset = Vector((float(translation[0]), float(translation[1]), float(translation[2])))
        for obj in objects:
            obj.location += offset

    if model_settings.get("ground_to_plane", True):
        mins, _ = object_bounds(objects)
        plane_z = float(background_settings.get("plane_z", -0.04))
        clearance = float(model_settings.get("ground_clearance", 0.015))
        lift = plane_z + clearance - mins.z
        for obj in objects:
            obj.location.z += lift


def apply_pass_visibility(objects, model_settings):
    """Layered-pass visibility, applied AFTER transform_model.

    The normalization basis stays the FULL product — every pass shares the same
    auto_center/auto_scale/ground_to_plane transform, so metal/stone layers
    align for compositing. Only then are non-target objects hidden or held out:

    - pass_hide_contains: matching objects get hide_render = True. Used by the
      METAL pass to fully hide stones, so metal renders complete behind where
      the stones sit.
    - pass_holdout_contains: matching objects stay renderable as holdouts —
      they punch alpha (correct occlusion silhouettes for compositing) without
      contributing color. Secondary ray visibility is disabled so the holdout
      metal does not refract dark into the stones.

    When neither field is present this is a no-op (old recipes unaffected).
    """
    hide_tokens = [token.lower() for token in model_settings.get("pass_hide_contains", [])]
    holdout_tokens = [token.lower() for token in model_settings.get("pass_holdout_contains", [])]
    if not hide_tokens and not holdout_tokens:
        return

    holdout_ray_visibility = [
        "visible_shadow",
        "visible_diffuse",
        "visible_glossy",
        "visible_transmission",
        "visible_volume_scatter",
    ]
    for obj in objects:
        signature = object_signature(obj)
        if hide_tokens and any(token in signature for token in hide_tokens):
            obj.hide_render = True
            continue
        if holdout_tokens and any(token in signature for token in holdout_tokens):
            obj.hide_render = False
            obj.is_holdout = True
            for attribute in holdout_ray_visibility:
                if hasattr(obj, attribute):
                    setattr(obj, attribute, False)


def make_material(name, preset):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    if preset.get("type") == "catalog_diamond":
        return make_catalog_diamond_material(material, preset)

    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return material

    inputs = bsdf.inputs
    values = {
        "Base Color": preset.get("base_color"),
        "Metallic": preset.get("metallic"),
        "Roughness": preset.get("roughness"),
        "Alpha": preset.get("alpha"),
        "IOR": preset.get("ior"),
        "Transmission Weight": preset.get("transmission_weight"),
        "Specular IOR Level": preset.get("specular_ior_level"),
    }
    for input_name, value in values.items():
        if value is not None and input_name in inputs:
            inputs[input_name].default_value = value
    material.blend_method = "BLEND" if preset.get("alpha", 1.0) < 1 else "OPAQUE"
    material.use_screen_refraction = preset.get("type") == "gem"
    return material


def set_node_input(node, input_name, value):
    if input_name in node.inputs and value is not None:
        node.inputs[input_name].default_value = value


def make_catalog_diamond_material(material, preset):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)

    glass = nodes.new("ShaderNodeBsdfGlass")
    glass.location = (-420, 120)
    set_node_input(glass, "Color", preset.get("glass_color", [1.0, 0.985, 0.955, 1.0]))
    set_node_input(glass, "Roughness", preset.get("roughness", 0.0))
    set_node_input(glass, "IOR", preset.get("ior", 2.417))

    glossy = nodes.new("ShaderNodeBsdfGlossy")
    glossy.location = (-420, -80)
    set_node_input(glossy, "Color", preset.get("gloss_color", [1.0, 1.0, 1.0, 1.0]))
    set_node_input(glossy, "Roughness", preset.get("gloss_roughness", 0.015))

    add = nodes.new("ShaderNodeAddShader")
    add.location = (-120, 80)
    links.new(glass.outputs["BSDF"], add.inputs[0])
    links.new(glossy.outputs["BSDF"], add.inputs[1])

    transparent_mix = float(preset.get("transparent_mix", 0.06))
    if transparent_mix > 0:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        transparent.location = (-120, -160)
        set_node_input(transparent, "Color", preset.get("transparent_color", [1.0, 1.0, 1.0, 1.0]))

        mix = nodes.new("ShaderNodeMixShader")
        mix.location = (180, 0)
        mix.inputs["Fac"].default_value = max(0.0, min(1.0, transparent_mix))
        links.new(add.outputs["Shader"], mix.inputs[1])
        links.new(transparent.outputs["BSDF"], mix.inputs[2])
        links.new(mix.outputs["Shader"], output.inputs["Surface"])
    else:
        links.new(add.outputs["Shader"], output.inputs["Surface"])

    material.blend_method = "BLEND"
    material.use_screen_refraction = True
    material.show_transparent_back = True
    return material


def mix_color(current, target, amount):
    amount = max(0.0, min(1.0, float(amount)))
    return [current[i] * (1.0 - amount) + target[i] * amount for i in range(min(len(current), len(target)))]


def socket_default(socket):
    value = getattr(socket, "default_value", None)
    if value is None:
        return None
    if hasattr(value, "__iter__") and not isinstance(value, str):
        return list(value)
    return value


def set_socket_default(socket, value):
    if value is not None and hasattr(socket, "default_value"):
        socket.default_value = value


def adjust_color_socket(node, input_name, target, amount):
    if input_name not in node.inputs:
        return
    current = socket_default(node.inputs[input_name])
    if not isinstance(current, list):
        return
    if len(target) == 3 and len(current) >= 4:
        target = [target[0], target[1], target[2], current[3]]
    set_socket_default(node.inputs[input_name], mix_color(current, target, amount))


def multiply_socket(node, input_name, scale, minimum=None, maximum=None):
    if input_name not in node.inputs or scale is None:
        return
    current = socket_default(node.inputs[input_name])
    if not isinstance(current, (int, float)):
        return
    value = current * float(scale)
    if minimum is not None:
        value = max(float(minimum), value)
    if maximum is not None:
        value = min(float(maximum), value)
    set_socket_default(node.inputs[input_name], value)


def adjust_source_material(material, adjust):
    if not adjust or not material or not material.use_nodes or not material.node_tree:
        return material

    material = material.copy()
    material.name = f"{material.name}_adjusted"
    glass_target = adjust.get("glass_color")
    glass_color_mix = adjust.get("glass_color_mix", 0)
    volume_target = adjust.get("volume_color")
    volume_color_mix = adjust.get("volume_color_mix", 0)
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeBsdfGlass":
            if glass_target is not None:
                adjust_color_socket(node, "Color", glass_target, glass_color_mix)
            if "Roughness" in node.inputs and "glass_roughness" in adjust:
                set_socket_default(node.inputs["Roughness"], float(adjust["glass_roughness"]))
            if "IOR" in node.inputs and "ior" in adjust:
                set_socket_default(node.inputs["IOR"], float(adjust["ior"]))
        elif node.bl_idname == "ShaderNodeBsdfPrincipled":
            base_color = adjust.get("base_color")
            if base_color is not None:
                adjust_color_socket(node, "Base Color", base_color, adjust.get("base_color_mix", 1.0))
            if "Metallic" in node.inputs and "metallic" in adjust:
                set_socket_default(node.inputs["Metallic"], float(adjust["metallic"]))
            if "Roughness" in node.inputs and "roughness" in adjust:
                set_socket_default(node.inputs["Roughness"], float(adjust["roughness"]))
            if "Alpha" in node.inputs and "alpha" in adjust:
                set_socket_default(node.inputs["Alpha"], float(adjust["alpha"]))
            if "Specular IOR Level" in node.inputs and "specular_ior_level" in adjust:
                set_socket_default(node.inputs["Specular IOR Level"], float(adjust["specular_ior_level"]))
            if "IOR" in node.inputs and "ior" in adjust:
                set_socket_default(node.inputs["IOR"], float(adjust["ior"]))
        elif node.bl_idname in {"ShaderNodeVolumeAbsorption", "ShaderNodeVolumeScatter"}:
            if volume_target is not None:
                adjust_color_socket(node, "Color", volume_target, volume_color_mix)
            multiply_socket(node, "Density", adjust.get("volume_density_scale"), 0.0, adjust.get("volume_density_max"))
        elif node.bl_idname == "ShaderNodeEmission":
            if "emission_color" in adjust:
                adjust_color_socket(node, "Color", adjust["emission_color"], adjust.get("emission_color_mix", 1.0))
            multiply_socket(node, "Strength", adjust.get("emission_strength_scale"), 0.0, adjust.get("emission_strength_max"))
        elif node.bl_idname == "ShaderNodeValue":
            if node.outputs:
                current = socket_default(node.outputs[0])
                if isinstance(current, (int, float)):
                    value = current * float(adjust.get("value_scale", 1.0)) + float(adjust.get("value_offset", 0.0))
                    if "value_min" in adjust:
                        value = max(float(adjust["value_min"]), value)
                    if "value_max" in adjust:
                        value = min(float(adjust["value_max"]), value)
                    node.outputs[0].default_value = value
        elif node.bl_idname == "ShaderNodeHueSaturation":
            multiply_socket(node, "Saturation", adjust.get("saturation_scale"), 0.0, adjust.get("saturation_max"))
            multiply_socket(node, "Value", adjust.get("hsv_value_scale"), 0.0, adjust.get("hsv_value_max"))

    material.diffuse_color = adjust.get("diffuse_color", material.diffuse_color)
    if "blend_method" in adjust:
        material.blend_method = adjust["blend_method"]
    if "use_screen_refraction" in adjust:
        material.use_screen_refraction = bool(adjust["use_screen_refraction"])
    return material


def object_signature(obj):
    material_names = " ".join(slot.material.name for slot in obj.material_slots if slot.material)
    return f"{obj.name} {material_names}".lower()


def assign_materials(objects, recipe):
    strategy = recipe.get("material_strategy", "override")
    if strategy == "source":
        return

    presets = {name: make_material(f"render_{name}", preset) for name, preset in recipe["materials"].items()}
    for obj in objects:
        signature = object_signature(obj)
        selected = None
        for rule in recipe.get("material_map", []):
            if any(token.lower() in signature for token in rule["contains"]):
                source_material = rule.get("source_material")
                if source_material:
                    selected = bpy.data.materials.get(source_material)
                    selected = adjust_source_material(selected, rule.get("source_material_adjust"))
                else:
                    selected = presets[rule["material"]]
                break
        if selected is None:
            if strategy == "hybrid":
                continue
            selected = presets["white_gold_polished"]
        obj.data.materials.clear()
        obj.data.materials.append(selected)


def setup_render(recipe):
    render = recipe["render"]
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = render["samples"]
    scene.cycles.use_denoising = render.get("denoise", True)
    scene.cycles.max_bounces = 16
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.transmission_bounces = 16
    scene.render.resolution_x = render["resolution"][0]
    scene.render.resolution_y = render["resolution"][1]
    scene.render.film_transparent = render.get("transparent", False)
    scene.view_settings.view_transform = render.get("view_transform", "Filmic")
    scene.view_settings.look = render.get("look", "Medium High Contrast")
    scene.view_settings.exposure = render.get("exposure", 0)
    scene.view_settings.gamma = render.get("gamma", 1)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def setup_world(recipe):
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    hdri_url = recipe["world"].get("hdri_url")
    if hdri_url:
        nodes = world.node_tree.nodes
        links = world.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputWorld")
        output.location = (520, 0)
        background = nodes.new("ShaderNodeBackground")
        background.location = (260, 0)
        env = nodes.new("ShaderNodeTexEnvironment")
        env.location = (-120, 0)
        hdri_path = Path(tempfile.gettempdir()) / Path(str(hdri_url).split("?")[0]).name
        if not hdri_path.exists():
            urllib.request.urlretrieve(hdri_url, hdri_path)
        env.image = bpy.data.images.load(str(hdri_path), check_existing=True)
        background.inputs["Strength"].default_value = recipe["world"].get("hdri_strength", recipe["world"].get("strength", 0.18))
        links.new(env.outputs["Color"], background.inputs["Color"])
        links.new(background.outputs["Background"], output.inputs["Surface"])
        return
    bg = world.node_tree.nodes.get("Background")
    if bg:
        color = recipe["world"].get("color", [1, 1, 1])
        bg.inputs["Color"].default_value = [color[0], color[1], color[2], 1]
        bg.inputs["Strength"].default_value = recipe["world"].get("strength", 0.18)


def setup_background(recipe):
    bg = recipe["background"]
    bpy.ops.mesh.primitive_plane_add(size=bg.get("plane_size", 8), location=(0, 0, bg.get("plane_z", -0.04)))
    plane = bpy.context.object
    plane.name = "catalog_shadow_plane"
    mat = make_material("catalog_warm_white", {"base_color": bg.get("color", [0.98, 0.98, 0.965, 1]), "roughness": 0.62})
    plane.data.materials.append(mat)
    # background.visible_camera=false (stone passes): the floor must keep
    # LIGHTING the product — diffuse/glossy/transmission bounce preserved — but
    # camera rays pass through it, so the transparent holdout layer ships as
    # pure stones-on-alpha for compositing. Legacy lesson: never delete the
    # floor for stone shots, hide it from camera only.
    if not bg.get("visible_camera", True) and hasattr(plane, "visible_camera"):
        plane.visible_camera = False


def add_contact_shadows(recipe):
    # Stone passes hide the floor from camera (background.visible_camera=false);
    # the fake contact-shadow discs sit on that floor and must vanish with it,
    # or they render as opaque pixels on the stones-on-alpha layer. They keep
    # diffuse visibility only — negligible, and consistent with the floor fix.
    camera_visible = bool(recipe.get("background", {}).get("visible_camera", True))
    for config in recipe.get("contact_shadows", []):
        layers = max(1, int(config.get("layers", 3)))
        base_alpha = float(config.get("alpha", 0.18))
        position = config.get("position", [0, 0, recipe["background"].get("plane_z", -0.04) + 0.002])
        size = config.get("size", [2.0, 0.55])
        color = config.get("color", [0.0, 0.0, 0.0])
        vertices_count = max(32, int(config.get("vertices", 96)))

        for layer in range(layers):
            scale_factor = 1.0 + (layer / max(1, layers - 1)) * float(config.get("spread", 0.55))
            alpha = base_alpha * (1.0 - layer / (layers + 0.5))
            z_offset = 0.001 + layer * 0.0005
            bpy.ops.mesh.primitive_circle_add(
                vertices=vertices_count,
                radius=1.0,
                fill_type="TRIFAN",
                location=(float(position[0]), float(position[1]), float(position[2]) + z_offset),
                rotation=(0, 0, math.radians(float(config.get("rotation_degrees", 0)))),
            )
            shadow = bpy.context.object
            shadow.name = f"{config.get('name', 'soft_contact_shadow')}_{layer + 1}"
            shadow.scale = (float(size[0]) * scale_factor, float(size[1]) * scale_factor, 1)
            mat = make_material(
                shadow.name + "_material",
                {
                    "base_color": [color[0], color[1], color[2], alpha],
                    "alpha": alpha,
                    "roughness": 0.85,
                },
            )
            shadow.data.materials.append(mat)
            shadow.visible_shadow = False
            shadow.visible_glossy = False
            shadow.visible_transmission = False
            if not camera_visible and hasattr(shadow, "visible_camera"):
                shadow.visible_camera = False


def add_reflection_cards_from_configs(configs):
    for config in configs:
        bpy.ops.mesh.primitive_plane_add(
            size=1.0,
            location=config["position"],
            rotation=[math.radians(v) for v in config.get("rotation_degrees", [0, 0, 0])],
        )
        card = bpy.context.object
        card.name = config["name"]
        size = config.get("size", [1, 1])
        card.scale = (size[0], size[1], 1)
        mat = make_material(config["name"] + "_material", {"base_color": config.get("color", [0.1, 0.1, 0.1, 1]), "roughness": 0.5})
        card.data.materials.append(mat)
        card.visible_camera = config.get("visible_to_camera", False)
        visibility_map = {
            "visible_shadow": config.get("visible_to_shadow", True),
            "visible_diffuse": config.get("visible_to_diffuse", True),
            "visible_glossy": config.get("visible_to_glossy", True),
            "visible_transmission": config.get("visible_to_transmission", True),
            "visible_volume_scatter": config.get("visible_to_volume_scatter", True),
        }
        for attribute, value in visibility_map.items():
            if hasattr(card, attribute):
                setattr(card, attribute, bool(value))


def add_reflection_cards(recipe):
    add_reflection_cards_from_configs(recipe.get("reflection_cards", []))


def add_lights(recipe):
    for config in recipe.get("lights", []):
        data = bpy.data.lights.new(config["name"], config["type"])
        obj = bpy.data.objects.new(config["name"], data)
        bpy.context.collection.objects.link(obj)
        obj.location = config["position"]
        obj.rotation_euler = [math.radians(v) for v in config.get("rotation_degrees", [0, 0, 0])]
        data.energy = config.get("power", 100)
        if "color" in config:
            color = config["color"]
            data.color = (color[0], color[1], color[2])
        if config["type"] == "AREA":
            data.shape = "RECTANGLE"
            data.size = config.get("size", 1)
            data.size_y = config.get("size_y", config.get("size", 1))
        if config["type"] == "POINT":
            data.shadow_soft_size = config.get("shadow_soft_size", 0.02)


def make_overlay_material(name, color, alpha):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = [color[0], color[1], color[2], alpha]
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.18
    material.blend_method = "BLEND"
    material.show_transparent_back = False
    return material


def add_center_facet_overlay(objects, recipe):
    config = recipe.get("facet_overlay", {})
    if not config.get("enabled", False):
        return []

    tokens = [token.lower() for token in config.get("object_contains", ["Round_5"])]
    target = None
    for obj in objects:
        if any(token in object_signature(obj) for token in tokens):
            target = obj
            break
    if target is None or bpy.context.scene.camera is None:
        return []

    mins, maxs = object_bounds([target])
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * float(config.get("radius_scale", 0.48))

    camera = bpy.context.scene.camera
    toward_camera = (camera.location - center).normalized()
    right = camera.matrix_world.to_quaternion() @ Vector((1, 0, 0))
    up = camera.matrix_world.to_quaternion() @ Vector((0, 1, 0))
    plane_center = center + toward_camera * float(config.get("camera_offset", 0.012))

    white = make_overlay_material("facet_overlay_white", [1.0, 1.0, 1.0], float(config.get("light_alpha", 0.2)))
    dark = make_overlay_material("facet_overlay_dark", [0.04, 0.045, 0.055], float(config.get("dark_alpha", 0.12)))
    blue = make_overlay_material("facet_overlay_blue", [0.34, 0.72, 1.0], float(config.get("chroma_alpha", 0.1)))
    amber = make_overlay_material("facet_overlay_amber", [1.0, 0.78, 0.22], float(config.get("chroma_alpha", 0.1)))
    materials = [white, dark, blue, white, amber, dark]

    created = []
    count = int(config.get("facets", 20))
    y_scale = float(config.get("y_scale", 0.82))
    inner_ratio = float(config.get("inner_ratio", 0.18))
    for index in range(count):
        a0 = -math.pi / 2 + index * math.tau / count
        a1 = -math.pi / 2 + (index + 1) * math.tau / count
        mid = (a0 + a1) * 0.5
        inner = radius * (inner_ratio if index % 2 else inner_ratio * 1.45)
        p0 = plane_center + right * (math.cos(a0) * radius) + up * (math.sin(a0) * radius * y_scale)
        p1 = plane_center + right * (math.cos(a1) * radius) + up * (math.sin(a1) * radius * y_scale)
        pc = plane_center + right * (math.cos(mid) * inner) + up * (math.sin(mid) * inner * y_scale)
        mesh = bpy.data.meshes.new(f"facet_overlay_mesh_{index:02d}")
        mesh.from_pydata([pc, p0, p1], [], [(0, 1, 2)])
        mesh.update()
        obj = bpy.data.objects.new(f"facet_overlay_{index:02d}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(materials[index % len(materials)])
        obj.visible_shadow = False
        obj.visible_diffuse = False
        obj.visible_glossy = False
        created.append(obj)

    return created


def setup_camera(recipe):
    cam_data = bpy.data.cameras.new("catalog_camera")
    cam = bpy.data.objects.new("catalog_camera", cam_data)
    bpy.context.collection.objects.link(cam)
    camera = recipe["camera"]
    cam.location = camera["position"]
    direction = Vector(camera["target"]) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = camera.get("focal_length", 90)
    cam_data.shift_x = float(camera.get("shift_x", 0.0))
    cam_data.shift_y = float(camera.get("shift_y", 0.0))
    dof = camera.get("depth_of_field", {})
    cam_data.dof.use_dof = dof.get("enabled", False)
    cam_data.dof.focus_distance = dof.get("focus_distance", direction.length)
    cam_data.dof.aperture_fstop = dof.get("f_stop", 7.5)
    bpy.context.scene.camera = cam


def object_image_bounds(objects):
    scene = bpy.context.scene
    camera = scene.camera
    width = scene.render.resolution_x
    height = scene.render.resolution_y
    bounds = []
    for obj in objects:
        # Only actually-visible objects report bounds: pass-hidden objects do
        # not render at all, and holdout objects only punch alpha.
        if obj.hide_render or getattr(obj, "is_holdout", False):
            continue
        projected = []
        mesh = obj.data
        vertices = getattr(mesh, "vertices", [])
        stride = max(1, math.ceil(len(vertices) / 4000)) if vertices else 1
        for index, vertex in enumerate(vertices):
            if index % stride:
                continue
            co = world_to_camera_view(scene, camera, obj.matrix_world @ vertex.co)
            projected.append((co.x, co.y))
        if not projected:
            continue
        x_values = [point[0] for point in projected]
        y_values = [point[1] for point in projected]
        raw_x0 = min(x_values)
        raw_x1 = max(x_values)
        raw_y0 = min(y_values)
        raw_y1 = max(y_values)
        if raw_x1 < 0.0 or raw_x0 > 1.0 or raw_y1 < 0.0 or raw_y0 > 1.0:
            continue
        x0 = max(0.0, raw_x0)
        x1 = min(1.0, raw_x1)
        y0 = max(0.0, raw_y0)
        y1 = min(1.0, raw_y1)
        if x1 <= x0 or y1 <= y0:
            continue
        material_names = [slot.material.name for slot in obj.material_slots if slot.material]
        bounds.append(
            {
                "name": obj.name,
                "materials": material_names,
                "signature": f"{obj.name} {' '.join(material_names)}",
                "bounds_norm": [x0, 1.0 - y1, x1, 1.0 - y0],
                "bounds_px": [round(x0 * width), round((1.0 - y1) * height), round(x1 * width), round((1.0 - y0) * height)],
            }
        )
    return bounds


def main():
    parsed = args()
    recipe = deep_merge(DEFAULT_RECIPE, json.loads(Path(parsed.recipe).read_text(encoding="utf-8")))
    if recipe.get("source_scene", {}).get("enabled", False):
        objects = setup_source_scene(Path(parsed.model), recipe)
        if not objects:
            raise RuntimeError("Source scene contains no visible mesh objects for metadata.")
        image_bounds = object_image_bounds(objects)
        bpy.context.scene.render.filepath = parsed.output
        bpy.ops.render.render(write_still=True)
        Path(parsed.metadata).write_text(
            json.dumps(
                {
                    "recipe": recipe,
                    "source_scene": True,
                    "scene": bpy.context.scene.name,
                    "camera": bpy.context.scene.camera.name if bpy.context.scene.camera else None,
                    "selected_objects": [obj.name for obj in objects],
                    "lights": [obj.name for obj in bpy.context.scene.objects if obj.type == "LIGHT" and not obj.hide_render],
                    "world": bpy.context.scene.world.name if bpy.context.scene.world else None,
                    "object_image_bounds": image_bounds,
                    "materials": [material.name for material in bpy.data.materials],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return

    clear_scene()
    setup_render(recipe)
    setup_world(recipe)
    objects = import_model(Path(parsed.model))
    objects = filter_product_objects(objects, recipe["model"])
    if not objects:
        raise RuntimeError("No product mesh objects matched model include/exclude filters.")
    imported_bounds = bounds_summary(objects)
    normalize(objects, recipe["model"])
    normalized_bounds = bounds_summary(objects)
    apply_object_transforms(objects, recipe["model"])
    generated_objects = add_generated_band(objects, recipe["model"])
    object_transformed_bounds = bounds_summary(objects)
    transform_model(objects, recipe["model"], recipe["background"])
    transformed_bounds = bounds_summary(objects)
    apply_pass_visibility(objects, recipe["model"])
    assign_materials(objects, recipe)
    setup_background(recipe)
    add_contact_shadows(recipe)
    add_reflection_cards(recipe)
    add_lights(recipe)
    setup_camera(recipe)
    overlay_objects = add_center_facet_overlay(objects, recipe)
    image_bounds = object_image_bounds(objects)
    bpy.context.scene.render.filepath = parsed.output
    bpy.ops.render.render(write_still=True)
    Path(parsed.metadata).write_text(
        json.dumps(
            {
                "recipe": recipe,
                "model_bounds": {
                    "imported": imported_bounds,
                    "normalized": normalized_bounds,
                    "object_transformed": object_transformed_bounds,
                    "transformed": transformed_bounds,
                },
                "selected_objects": [obj.name for obj in objects],
                "generated_objects": [obj.name for obj in generated_objects],
                "overlay_objects": [obj.name for obj in overlay_objects],
                "object_image_bounds": image_bounds,
                "materials": [material.name for material in bpy.data.materials],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

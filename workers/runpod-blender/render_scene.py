from __future__ import annotations

import argparse
import json
import math
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


def add_reflection_cards(recipe):
    for config in recipe.get("reflection_cards", []):
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


def add_lights(recipe):
    for config in recipe.get("lights", []):
        data = bpy.data.lights.new(config["name"], config["type"])
        obj = bpy.data.objects.new(config["name"], data)
        bpy.context.collection.objects.link(obj)
        obj.location = config["position"]
        obj.rotation_euler = [math.radians(v) for v in config.get("rotation_degrees", [0, 0, 0])]
        data.energy = config.get("power", 100)
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
    dof = camera.get("depth_of_field", {})
    cam_data.dof.use_dof = dof.get("enabled", False)
    cam_data.dof.focus_distance = direction.length
    cam_data.dof.aperture_fstop = dof.get("f_stop", 7.5)
    bpy.context.scene.camera = cam


def object_image_bounds(objects):
    scene = bpy.context.scene
    camera = scene.camera
    width = scene.render.resolution_x
    height = scene.render.resolution_y
    bounds = []
    for obj in objects:
        projected = []
        for corner in obj.bound_box:
            co = world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
            if co.z >= 0:
                projected.append((co.x, co.y))
        if not projected:
            continue
        x_values = [point[0] for point in projected]
        y_values = [point[1] for point in projected]
        x0 = max(0.0, min(x_values))
        x1 = min(1.0, max(x_values))
        y0 = max(0.0, min(y_values))
        y1 = min(1.0, max(y_values))
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
    transform_model(objects, recipe["model"], recipe["background"])
    transformed_bounds = bounds_summary(objects)
    assign_materials(objects, recipe)
    setup_background(recipe)
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
                    "transformed": transformed_bounds,
                },
                "selected_objects": [obj.name for obj in objects],
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

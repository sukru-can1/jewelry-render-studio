from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


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
        "shade_smooth": True,
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
        for obj in objects:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
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


def make_material(name, preset):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
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
    normalize(objects, recipe["model"])
    assign_materials(objects, recipe)
    setup_background(recipe)
    add_lights(recipe)
    setup_camera(recipe)
    bpy.context.scene.render.filepath = parsed.output
    bpy.ops.render.render(write_still=True)
    Path(parsed.metadata).write_text(json.dumps({"recipe": recipe}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

import argparse
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    argv = []
    if "--" in __import__("sys").argv:
        argv = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    return parser.parse_args(argv)


def load_recipe(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def radians_xyz(degrees):
    return tuple(math.radians(value) for value in degrees)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def import_model(path):
    ext = path.suffix.lower()
    before = set(bpy.data.objects)
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".stl":
        bpy.ops.wm.stl_import(filepath=str(path))
    else:
        raise ValueError(f"Unsupported model extension: {ext}")
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def normalize_model(objects, settings):
    if not objects:
        return
    if settings.get("shade_smooth", True):
        for obj in objects:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth()
            obj.select_set(False)

    rotation = settings.get("rotation_degrees", [0, 0, 0])
    for obj in objects:
        obj.rotation_euler.rotate_axis("X", math.radians(rotation[0]))
        obj.rotation_euler.rotate_axis("Y", math.radians(rotation[1]))
        obj.rotation_euler.rotate_axis("Z", math.radians(rotation[2]))

    bpy.context.view_layer.update()
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world_corner.x)
            mins.y = min(mins.y, world_corner.y)
            mins.z = min(mins.z, world_corner.z)
            maxs.x = max(maxs.x, world_corner.x)
            maxs.y = max(maxs.y, world_corner.y)
            maxs.z = max(maxs.z, world_corner.z)

    center = (mins + maxs) * 0.5
    size = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z)
    scale = settings.get("target_size", 2.0) / size if settings.get("auto_scale", True) and size > 0 else 1.0
    for obj in objects:
        if settings.get("auto_center", True):
            obj.location -= center
        obj.scale *= scale

    bevel = settings.get("bevel_modifier", {})
    if bevel.get("enabled", False):
        for obj in objects:
            modifier = obj.modifiers.new("micro_bevel_for_highlights", "BEVEL")
            modifier.width = bevel.get("width", 0.005)
            modifier.segments = bevel.get("segments", 3)
            modifier.affect = "EDGES"
            obj.modifiers.new("weighted_normals", "WEIGHTED_NORMAL")


def create_principled_material(name, preset):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return mat

    def set_input(input_name, value):
        if input_name in bsdf.inputs:
            bsdf.inputs[input_name].default_value = value

    set_input("Base Color", preset.get("base_color", [1, 1, 1, 1]))
    set_input("Metallic", preset.get("metallic", 0.0))
    set_input("Roughness", preset.get("roughness", 0.2))
    set_input("Alpha", preset.get("alpha", 1.0))
    set_input("IOR", preset.get("ior", 1.45))
    set_input("Transmission Weight", preset.get("transmission_weight", 0.0))
    set_input("Specular IOR Level", preset.get("specular_ior_level", 0.5))
    mat.blend_method = "BLEND" if preset.get("alpha", 1.0) < 1.0 else "OPAQUE"
    mat.use_screen_refraction = preset.get("kind") == "gem"
    return mat


def assign_materials(objects, recipe):
    material_settings = recipe["materials"]
    presets = material_settings["presets"]
    metal = create_principled_material("recipe_" + material_settings["default_metal"], presets[material_settings["default_metal"]])
    stone = create_principled_material("recipe_" + material_settings["default_stone"], presets[material_settings["default_stone"]])
    stone_tokens = ("diamond", "stone", "gem", "brilliant", "sapphire", "ruby", "emerald")

    for obj in objects:
        name = (obj.name + " " + " ".join(slot.material.name if slot.material else "" for slot in obj.material_slots)).lower()
        chosen = stone if any(token in name for token in stone_tokens) else metal
        obj.data.materials.clear()
        obj.data.materials.append(chosen)


def setup_render(recipe):
    render = recipe["render"]
    scene = bpy.context.scene
    scene.render.engine = render.get("engine", "CYCLES")
    scene.cycles.samples = render.get("samples", 128)
    scene.cycles.use_denoising = render.get("denoise", True)
    scene.cycles.max_bounces = 16
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.transmission_bounces = 16
    scene.render.resolution_x = render.get("resolution", [1400, 1400])[0]
    scene.render.resolution_y = render.get("resolution", [1400, 1400])[1]
    scene.render.film_transparent = render.get("transparent", False)
    scene.view_settings.view_transform = render.get("view_transform", "Filmic")
    scene.view_settings.look = render.get("look", "Medium High Contrast")
    scene.view_settings.exposure = render.get("exposure", 0.0)
    scene.view_settings.gamma = render.get("gamma", 1.0)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def setup_world(recipe):
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = recipe["world"].get("color", [1, 1, 1])
    world.node_tree.nodes if world.use_nodes else None
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (*recipe["world"].get("color", [1, 1, 1]), 1)
        bg.inputs["Strength"].default_value = recipe["world"].get("strength", 0.2)


def add_background(recipe):
    bg = recipe.get("background", {})
    if not bg.get("shadow_plane", True):
        return
    bpy.ops.mesh.primitive_plane_add(size=bg.get("plane_size", 8.0), location=(0, 0, bg.get("plane_z", -0.04)))
    plane = bpy.context.object
    plane.name = "matte_catalog_shadow_plane"
    mat = bpy.data.materials.new("warm_white_catalog_floor")
    mat.diffuse_color = bg.get("color", [0.98, 0.98, 0.965, 1])
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = bg.get("color", [0.98, 0.98, 0.965, 1])
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.62
    plane.data.materials.append(mat)


def add_light(config):
    kind = config["type"].upper()
    data = bpy.data.lights.new(config["name"], kind)
    obj = bpy.data.objects.new(config["name"], data)
    bpy.context.collection.objects.link(obj)
    obj.location = config["position"]
    obj.rotation_euler = radians_xyz(config.get("rotation_degrees", [0, 0, 0]))
    data.energy = config.get("power", 100)
    if kind == "AREA":
        data.shape = "RECTANGLE"
        data.size = config.get("size", 1.0)
        data.size_y = config.get("size_y", config.get("size", 1.0))
    if kind == "POINT":
        data.shadow_soft_size = config.get("shadow_soft_size", 0.02)
    return obj


def add_reflection_card(config):
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=config["position"], rotation=radians_xyz(config.get("rotation_degrees", [0, 0, 0])))
    card = bpy.context.object
    card.name = config["name"]
    card.scale = (config.get("size", [1, 1])[0], config.get("size", [1, 1])[1], 1)
    mat = bpy.data.materials.new(config["name"] + "_material")
    mat.diffuse_color = config.get("color", [0.1, 0.1, 0.1, 1])
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = config.get("color", [0.1, 0.1, 0.1, 1])
    card.data.materials.append(mat)
    visible = config.get("visible_to_camera", False)
    card.visible_camera = visible
    return card


def setup_camera(recipe):
    cam_data = bpy.data.cameras.new("catalog_camera")
    cam = bpy.data.objects.new("catalog_camera", cam_data)
    bpy.context.collection.objects.link(cam)
    settings = recipe["camera"]
    cam.location = settings["position"]
    look_at(cam, settings["target"])
    cam_data.lens = settings.get("focal_length", 90)
    cam_data.sensor_width = settings.get("sensor_width", 32)
    dof = settings.get("depth_of_field", {})
    cam_data.dof.use_dof = dof.get("enabled", False)
    cam_data.dof.focus_distance = (Vector(settings["position"]) - Vector(settings["target"])).length
    cam_data.dof.aperture_fstop = dof.get("f_stop", 8.0)
    bpy.context.scene.camera = cam


def render(output):
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    recipe = load_recipe(args.recipe)
    clear_scene()
    setup_render(recipe)
    setup_world(recipe)
    objects = import_model(Path(args.model))
    normalize_model(objects, recipe.get("model", {}))
    assign_materials(objects, recipe)
    add_background(recipe)
    for light in recipe.get("lights", []):
        add_light(light)
    for card in recipe.get("reflection_cards", []):
        add_reflection_card(card)
    setup_camera(recipe)
    render(args.output)
    with open(args.metadata, "w", encoding="utf-8") as handle:
        json.dump({"model": args.model, "recipe": args.recipe, "output": args.output, "variant": recipe.get("variant")}, handle, indent=2)


if __name__ == "__main__":
    main()

